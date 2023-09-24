'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const amiga = require('../lib/amiga');
const { countGalleries, fetchGalleries } = require('../lib/gallery');
const LHA = require('../lib/lha');
const { sequential, takeUntil } = require('../lib/utils');

if (require.main === module) {
	const song = process.argv[2];
	console.log(splitSong({ song }, new Uint8Array(fs.readFileSync(song))));
}

const PLATFORM = 'Amiga';

const ARCHIVE_PATH_BUGS = {
	'Risky_Woods\\mod.Risky Woods - Grand       ': 'Risky_Woods\\mod.Risky Woods - Grand',
};

const GAME_DUPLICATES = [
	'https://www.exotica.org.uk/wiki/Body_Blows_(AGA)',
];

const IGNORED_FILES = /(^|\/)(smpl?\.|instruments\/|Art_and_Magic_Player_Source)/;

const EXTRA_LINKS = [
	{ title: 'Wrath of the Demon', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=1148' },
];

function normalizeName(name) {
	return name.replace(/^(The)\s+(.*)$/, '$2, $1');
}

async function fetchGame(url, source) {
	const samplesBundle = /(^|\/)(rjp|jpn|mdat)(\.)/;
	const samplesPrefix = { rjp: 'smp', jpn: 'smp', mdat: 'smpl' };
	if (GAME_DUPLICATES.includes(url))
		return null;

	const html = await (await fetch(url)).text();
	const doc = new dom().parseFromString(html);
	const infobox = xpath.select1("//table[contains(@class, 'infobox')]", doc);
	const title = normalizeName(xpath.select("normalize-space(.//tr[1]/th/i)", infobox));
	//const composers = xpath.select(".//tr[normalize-space(th/text()) = 'Composer(s)']/td/a/text()", infobox).map(t => t.data);
	const developers = xpath.select(".//tr[normalize-space(th/text()) = 'Team(s)']/td/a/text()", infobox).map(t => t.data);
	const publishers = xpath.select(".//tr[normalize-space(th/text()) = 'Publisher(s)']/td/a/text()", infobox).map(t => t.data);
	const year = parseInt(xpath.select("normalize-space(.//tr[normalize-space(th/text()) = 'Year published']/td)", infobox)) || null;
	const music = xpath.select1("//h2/span[normalize-space() = 'UnExoticA Music Files']", doc);
	const followingHeaders = xpath.select("../following-sibling::*[name() = 'h3' or name() = 'h2' or name() = 'h1']", music);
	const nextSection = followingHeaders.find(h => h.nodeName != 'h3');
	const childHeaders = takeUntil(followingHeaders, nextSection).filter(h => !/CDDA/.test(h.textContent));
	//const childChapters = childHeaders.map((h, i) => takeUntil(xpath.select("./following-sibling::*", h), childHeaders[i+1] || nextSection));
	const urls = childHeaders.map(h => xpath.select1("string(./following-sibling::*//a/@href)", h));
	const tables = childHeaders.map(h => xpath.select1("./following-sibling::table[contains(@class, 'filetable')]", h));
	const linksSection = xpath.select1("//h2/span[normalize-space() = 'External Links']/../following-sibling::ul", doc);
	const links = await fetchGalleries([...linksSection && xpath.select("li", linksSection).map(item => ({
		title: xpath.select1('normalize-space(./a[1]/text())', item),
		site: xpath.select1('normalize-space(./a[2]/text())', item),
		url: xpath.select1('string(./a[1]/@href)', item),
	})), ...EXTRA_LINKS.filter(link => link.title === title)]);
	console.log(title, childHeaders.map(h => xpath.select("string(./span[1]/@id)", h)), { gallery: countGalleries(links) });
	let cwd = [];
	const songsData = tables.map(t => xpath.select(".//tr[position()>1]", t).map(row => {
		const dir = (row.getAttribute('class') || '').includes('dir');
		const name = xpath.select("normalize-space(./td[1]/text())", row);
		const size = parseInt(xpath.select("string(./td[2])", row)) || null;
		const composer = xpath.select("string(./td[3])", row);
		const game = xpath.select("string(./td[4])", row);
		cwd[xpath.select("count(./td[1]/a[contains(@class, 'image')])", row)] = name;
		const path = xpath.select("./td[1]/a[contains(@class, 'image')]", row).map((n, i) => cwd[i]).concat(name);
		const song_link = path.join('/');
		const song = path.slice(1).join('/');
		return (dir || IGNORED_FILES.test(song)) ? null : { song, song_link, size, composer };
	}).filter(song => song));

	const songDownloaded = song => {
		try {
			if (samplesBundle.test(song.song)) {
				const zip = new AdmZip(`${song.song_link}.zip`);
				const entry = zip.getEntry(path.basename(song.song_link));
				const dir = path.dirname(song.song_link);
				return song.size === entry.header.size ? zip : undefined;
			}
			return song.size === fs.statSync(song.song_link).size ?
				new Uint8Array(fs.readFileSync(song.song_link)) : undefined;
		} catch {
			return undefined;
		}
	};
	const archives = await Promise.all(urls.map(async (url, i) => {
		if (songsData[i].every(songDownloaded))
			return null;
		console.info(`downloading ${url} ...`);
		return LHA.read(new Uint8Array(await (await fetch(url)).arrayBuffer()));
	}));
	const songs = songsData.map((songs, i) => songs.map(song => {
		const downloaded = songDownloaded(song);
		if (downloaded) {
			let size;
			if (samplesBundle.test(song.song)) {
				size = downloaded.getEntries().map(entry => entry.header.size).reduce((a, e) => a+e, 0);
			} else {
				size = downloaded.length;
			}
			return splitSong(title, {
				...song,
				size,
				song_link: `${source}/${song.song_link}${samplesBundle.test(song.song) ? '.zip' : ''}`,
				source_archive: urls[i],
			}, downloaded);
		}
		const findEntry = (path) => archives[i].find(
			entry => (ARCHIVE_PATH_BUGS[entry.name] || entry.name).replace(/\\/g, '/') === path
		);
		const entry = findEntry(song.song_link);
		if (!entry) {
			console.warn(`file not found: ${song.song_link}`);
			return;
		}
		try {
			fs.mkdirSync(path.dirname(song.song_link), { recursive: true });
		} catch {}
		let file, size;
		if (samplesBundle.test(song.song)) {
			const samplesLink = song.song_link.replace(samplesBundle, (m, s, p, d) => `${s}${samplesPrefix[p]}${d}`);
			const samplesEntry = findEntry(samplesLink);
			if (!samplesEntry) {
				console.warn(`file not found: ${samplesLink}`);
				return;
			}
			const zip = new AdmZip();
			zip.addFile(path.basename(song.song_link), LHA.unpack(entry));
			zip.addFile(path.basename(samplesLink), LHA.unpack(samplesEntry));
			fs.writeFileSync(`${song.song_link}.zip`, zip.toBuffer());
			file = zip;
			size = entry.length + samplesEntry.length;
		} else {
			file = LHA.unpack(entry);
			size = entry.length;
			fs.writeFileSync(song.song_link, file);
		}
		return splitSong(title, {
			...song,
			size,
			song_link: `${source}/${song.song_link}${samplesBundle.test(song.song) ? '.zip' : ''}`,
			source_archive: urls[i],
		}, file);
	})).flat(2);

	return {
		game: title, platform: PLATFORM, developers, publishers, year, source, source_link: url, links, songs,
	};
}

const songSplitSingle = {
	'Brutal Football': {
		'rjp.TITLE': true,
	},
	'Cannon Fodder 2': {
		'rjp.KILLER': true,
	},
};

const songSplitFixed = {
	'Brutal Football': {
		'rjp.INGAME': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
		'rjp.LOCKER': [1, 2],
		'rjp.TITLE': [1],
	},
	'Cannon Fodder': {
		'rjp.DESBASE': [2, 4],
		'rjp.ICEBASE': [1, 2, 4],
		'rjp.INTBASE': [1, 3, 4, 5],
		'rjp.JON': [0, 6, 7, 8, 12, 15],
		'rjp.JUNBASE': [1, 2, 4, 5, 6, 7],
		'rjp.MORBASE': [1, 2, 3, 4],
		'rjp.WARX4': [0],
	},
	'Cannon Fodder 2': {
		'rjp.DESBASE': [1, 2, 3, 4, 5, 6, 7],
		'rjp.ICEBASE': [1, 2, 3, 4, 5, 6, 7],
		'rjp.INTBASE': [1, 2, 3, 4, 5, 6, 7],
		'rjp.JON': [0, 6, 7, 8, 12, 15],
		'rjp.JUNBASE': [1, 2, 3, 4, 5, 6, 7],
		'rjp.KILLER': [3],
		'rjp.MORBASE': [1, 2, 4, 5, 6, 7],
	},
	'Chaos Engine, The': {
		'rjp.game_end': [2, 3, 5, 6, 9, 10, 11, 14, 16, 17, 18, 19],
		'rjp.ingame_1': range(4, 37),
		'rjp.ingame_2': range(3, 37),
		'rjp.ingame_3': range(3, 36),
		'rjp.ingame_4': range(4, 37),
		'rjp.menu': range(2, 19),
		'Unused/rjp.Chaos_Engine_Demo': [1, ...range(4, 37)],
		'Unused/rjp.SHOP_S': range(1, 8),
	},
	'Diggers': {
		'rjp.dig': [24, 26, 27, 28, 29, 30, 31, 33],
	},
};

function range(from, to) {
	const res = [];
	for (let i = from; i <= to; i++) res.push(i);
	return res;
}

function splitSong(game, song, file) {
	let subsongs = [];
	if (songSplitFixed[game]?.[song.song])
		subsongs = songSplitFixed[game][song.song];
	else if (/(^|\/|\\)mdat(\.)/.test(song.song))
		subsongs = amiga.splitSongTFMX(song, file);
	else if (/(^|\/|\\)mod(\.)/.test(song.song))
		subsongs = amiga.splitSongMOD(song, file);
	else if (/(^|\/|\\)di(\.)/.test(song.song))
		subsongs = amiga.splitSongDI(song, file);
	else if (/(^|\/|\\)rh(\.)/.test(song.song))
		subsongs = amiga.splitSongRH(song, file);
	else if (/(^|\/|\\)dw(\.)/.test(song.song))
		subsongs = amiga.splitSongDW(song, file);
	else if (/(^|\/|\\)rjp(\.)/.test(song.song))
		subsongs = amiga.splitSongRJP(song, file.getEntries().find(entry => entry.name.match(/^rjp\./)).getData());
	const min = songSplitSingle[game]?.[song.song] ? 0 : 1;
	return subsongs.length <= min ? [song] : subsongs.map(i => ({
		...song,
		song: `${song.song} #${i+1}`,
		song_link: `${song.song_link}#${i+1}`,
	}));
}

async function fetchUnexotica(source) {
	const games = [
		'https://www.exotica.org.uk/wiki/Arnie_2',
		'https://www.exotica.org.uk/wiki/Agony_(game)',
		'https://www.exotica.org.uk/wiki/Aladdin',
		'https://www.exotica.org.uk/wiki/Alien_Breed',
		'https://www.exotica.org.uk/wiki/Alien_Breed_II_-_The_Horror_Continues',
		'https://www.exotica.org.uk/wiki/Alien_Breed_Special_Edition',
		'https://www.exotica.org.uk/wiki/Alien_Breed:_Tower_Assault',
		'https://www.exotica.org.uk/wiki/All_New_World_Of_Lemmings',
		'https://www.exotica.org.uk/wiki/Another_World',
		'https://www.exotica.org.uk/wiki/Apidya_(game)',
		'https://www.exotica.org.uk/wiki/Arabian_Nights',
		'https://www.exotica.org.uk/wiki/Assassin',
		'https://www.exotica.org.uk/wiki/Assassin_Special_Edition',
		'https://www.exotica.org.uk/wiki/Les_Aventures_de_Moktar',
		'https://www.exotica.org.uk/wiki/Barbarian_II',
		'https://www.exotica.org.uk/wiki/Body_Blows',
		'https://www.exotica.org.uk/wiki/Body_Blows_(AGA)',
		'https://www.exotica.org.uk/wiki/Body_Blows_Galactic',
		'https://www.exotica.org.uk/wiki/Brutal_Football',
		'https://www.exotica.org.uk/wiki/Bubba_%27n%27_Stix',
		'https://www.exotica.org.uk/wiki/Budokan_-_The_Martial_Spirit',
		'https://www.exotica.org.uk/wiki/Cannon_Fodder',
		'https://www.exotica.org.uk/wiki/Cannon_Fodder_2',
		'https://www.exotica.org.uk/wiki/Castlevania',
		'https://www.exotica.org.uk/wiki/The_Chaos_Engine',
		'https://www.exotica.org.uk/wiki/Chase_H.Q.',
		'https://www.exotica.org.uk/wiki/Chuck_Rock',
		'https://www.exotica.org.uk/wiki/Chuck_Rock_2_-_Son_of_Chuck',
		'https://www.exotica.org.uk/wiki/Christmas_Lemmings_1993',
		'https://www.exotica.org.uk/wiki/Colorado',
		'https://www.exotica.org.uk/wiki/Cool_Spot',
		'https://www.exotica.org.uk/wiki/Crazy_Cars_III',
		'https://www.exotica.org.uk/wiki/Diggers',
		'https://www.exotica.org.uk/wiki/Dojo_Dan',
		'https://www.exotica.org.uk/wiki/Double_Dragon',
		'https://www.exotica.org.uk/wiki/Double_Dragon_II_-_The_Revenge',
		'https://www.exotica.org.uk/wiki/Double_Dragon_III_-_The_Rosetta_Stone',
		'https://www.exotica.org.uk/wiki/Dune_(game)',
		'https://www.exotica.org.uk/wiki/Dune_II_-_The_Battle_for_Arrakis',
		'https://www.exotica.org.uk/wiki/Elfmania',
		'https://www.exotica.org.uk/wiki/Escape_from_Colditz',
		'https://www.exotica.org.uk/wiki/Final_Fight',
		'https://www.exotica.org.uk/wiki/Fire_%26_Ice_-_The_Daring_Adventures_Of_Cool_Coyote',
		'https://www.exotica.org.uk/wiki/First_Samurai',
		'https://www.exotica.org.uk/wiki/Flashback',
		'https://www.exotica.org.uk/wiki/Full_Contact',
		'https://www.exotica.org.uk/wiki/Fury_of_the_Furries',
		'https://www.exotica.org.uk/wiki/Ghosts_%27n_Goblins',
		'https://www.exotica.org.uk/wiki/Ghouls_%27n%27_Ghosts',
		'https://www.exotica.org.uk/wiki/Gloom_(game)',
		'https://www.exotica.org.uk/wiki/Gobliiins',
		'https://www.exotica.org.uk/wiki/Gods_(game)',
		'https://www.exotica.org.uk/wiki/Golden_Axe',
		'https://www.exotica.org.uk/wiki/Holiday_Lemmings_1994',
		'https://www.exotica.org.uk/wiki/IK%2B',
		'https://www.exotica.org.uk/wiki/Jaguar_XJ220',
		'https://www.exotica.org.uk/wiki/Jim_Power_in_%22Mutant_Planet%22',
		'https://www.exotica.org.uk/wiki/Kajko_i_Kokosz',
		'https://www.exotica.org.uk/wiki/Last_Ninja_2_-_Back_with_a_Vengeance',
		'https://www.exotica.org.uk/wiki/Last_Ninja_3',
		'https://www.exotica.org.uk/wiki/Lemmings',
		'https://www.exotica.org.uk/wiki/Lemmings_2_-_The_Tribes',
		'https://www.exotica.org.uk/wiki/The_Lion_King',
		'https://www.exotica.org.uk/wiki/The_Lost_Vikings',
		'https://www.exotica.org.uk/wiki/Lotus_Esprit_Turbo_Challenge',
		'https://www.exotica.org.uk/wiki/Lotus_Turbo_Challenge_2',
		'https://www.exotica.org.uk/wiki/Lotus_III_-_The_Ultimate_Challenge',
		'https://www.exotica.org.uk/wiki/Moonstone_-_A_Hard_Days_Knight',
		'https://www.exotica.org.uk/wiki/Mortal_Kombat',
		'https://www.exotica.org.uk/wiki/Mortal_Kombat_II',
		'https://www.exotica.org.uk/wiki/Mr._Nutz_-_Hoppin%27_Mad',
		'https://www.exotica.org.uk/wiki/Myth_-_History_in_the_Making',
		'https://www.exotica.org.uk/wiki/Nicky_Boom',
		'https://www.exotica.org.uk/wiki/Oh_No!_More_Lemmings',
		'https://www.exotica.org.uk/wiki/Pang',
		'https://www.exotica.org.uk/wiki/Pinball_Dreams',
		'https://www.exotica.org.uk/wiki/Pinball_Fantasies',
		'https://www.exotica.org.uk/wiki/Prehistorik',
		'https://www.exotica.org.uk/wiki/Project-X',
		'https://www.exotica.org.uk/wiki/Rick_Dangerous',
		'https://www.exotica.org.uk/wiki/Rise_of_the_Robots',
		'https://www.exotica.org.uk/wiki/Risky_Woods',
		'https://www.exotica.org.uk/wiki/Road_Rash',
		'https://www.exotica.org.uk/wiki/Ruff_%27n%27_Tumble',
		'https://www.exotica.org.uk/wiki/The_Secret_of_Monkey_Island',
		'https://www.exotica.org.uk/wiki/The_Settlers',
		'https://www.exotica.org.uk/wiki/Shadow_Fighter',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast_II',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast_III',
		'https://www.exotica.org.uk/wiki/Shaq-Fu',
		'https://www.exotica.org.uk/wiki/Soccer_Kid',
		'https://www.exotica.org.uk/wiki/Street_Fighter_II',
		'https://www.exotica.org.uk/wiki/Superfrog',
		'https://www.exotica.org.uk/wiki/Super_Street_Fighter_II_Turbo',
		'https://www.exotica.org.uk/wiki/Super_Street_Fighter_II_-_The_New_Challengers',
		'https://www.exotica.org.uk/wiki/SWIV',
		'https://www.exotica.org.uk/wiki/Titus_the_Fox',
		'https://www.exotica.org.uk/wiki/Turrican',
		'https://www.exotica.org.uk/wiki/Turrican_II_-_The_Final_Fight',
		'https://www.exotica.org.uk/wiki/Turrican_3',
		'https://www.exotica.org.uk/wiki/Ultima_VI_-_The_False_Prophet',
		'https://www.exotica.org.uk/wiki/Ugh!',
		'https://www.exotica.org.uk/wiki/Walker',
		'https://www.exotica.org.uk/wiki/Wings_of_Fury',
		'https://www.exotica.org.uk/wiki/Wrath_of_the_Demon',
		'https://www.exotica.org.uk/wiki/Yo!_Joe!',
	];
	return (await sequential(games.map(game => () => fetchGame(game, source)))).filter(game => game);
};

exports.fetchUnexotica = fetchUnexotica;
