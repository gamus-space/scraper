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

const PLATFORM = 'Amiga';

const ARCHIVE_PATH_BUGS = {
	'Awesome\\mod.  stry': 'Awesome\\mod. stry',
	'Dangerous_Streets\\mod.dangerous streets  ': 'Dangerous_Streets\\mod.dangerous streets',
	'Dangerous_Streets\\mod.inthegame        ': 'Dangerous_Streets\\mod.inthegame',
	'Dangerous_Streets\\mod.orientalsound     ': 'Dangerous_Streets\\mod.orientalsound',
	'Dangerous_Streets\\mod.thelastfight     ': 'Dangerous_Streets\\mod.thelastfight',
	'Risky_Woods\\mod.Risky Woods - Grand       ': 'Risky_Woods\\mod.Risky Woods - Grand',
};

const SAMPLES_OVERRIDE = {
	'James_Pond_2/AGA_Version/rjp.bonus': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.ingame_1': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.ingame_2': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.ingame_3': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.ingame_4': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.ingame_5': 'James_Pond_2/AGA_Version/smp.set',
	'James_Pond_2/AGA_Version/rjp.title': 'James_Pond_2/AGA_Version/smp.set',
};

const GAME_DUPLICATES = [
	'https://www.exotica.org.uk/wiki/Body_Blows_(AGA)',
];

const IGNORED_FILES = /(^|\/)(smpl?\.|mod\..+\.nt|[Ii]nstruments\/|Art_and_Magic_Player_Source|musica\.(readme|txt))/;

const EXTRA_LINKS = [
	{ title: 'Crystal Hammer', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=284' },
	{ title: 'Dungeon Master II', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=1395' },
	{ title: 'Galactic', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=4552' },
	{ title: 'Galaga\'92', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=4517' },
	{ title: 'Mentor', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=4321' },
	{ title: 'Teenage Mutant Hero Turtles', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=3248' },
	{ title: 'Wrath of the Demon', site: 'Lemon Amiga', url: 'https://www.lemonamiga.com/games/details.php?id=1148' },
];

const EMPTY_GALLERY = [
	'Boulder Dash',
	'Shanghai',
];

const NAME_OVERRIDE = {
	'A Prehistoric Tale': 'Prehistoric Tale, A',
	'Legend of Kyrandia': 'Legend of Kyrandia: Book One, The',
	'Xenon 2': 'Xenon 2: Megablast',
};

function normalizeName(name) {
	return NAME_OVERRIDE[name] ?? name.replace(/^(The)\s+(.*)$/, '$2, $1');
}

async function fetchGame(url, source) {
	const samplesBundle = /(^|\/)(rjp|jpn|mdat)(\.)/;
	const samplesPrefix = { rjp: 'smp', jpn: 'smp', mdat: 'smpl' };
	if (GAME_DUPLICATES.includes(url))
		return null;

	const html = await (await fetch(url, { headers: { Cookie: 'verified=1' } })).text();
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
	const links = await fetchGalleries([...(linksSection && xpath.select("li", linksSection).map(item => ({
		title: xpath.select1('normalize-space(./a[1]/text())', item),
		site: xpath.select1('normalize-space(./a[2]/text())', item),
		url: xpath.select1('string(./a[1]/@href)', item),
	}))) ?? [], ...EXTRA_LINKS.filter(link => link.title === title)]);
	const galleryCount = countGalleries(links);
	console.log(title, childHeaders.map(h => xpath.select("string(./span[1]/@id)", h)), { gallery: galleryCount });
	if (galleryCount === 0 && !EMPTY_GALLERY.includes(title))
		throw new Error('empty gallery');
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

	const sanitizeSong = song => song.replaceAll('#', '');
	const songDownloaded = song => {
		try {
			if (samplesBundle.test(song.song)) {
				const zip = new AdmZip(`${song.song_link}.zip`);
				const entry = zip.getEntry(path.basename(song.song_link));
				const dir = path.dirname(song.song_link);
				return song.size === entry.header.size ? zip : undefined;
			}
			return song.size === fs.statSync(sanitizeSong(song.song_link)).size ?
				new Uint8Array(fs.readFileSync(sanitizeSong(song.song_link))) : undefined;
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
				song: sanitizeSong(song.song),
				size,
				song_link: `${source}/${sanitizeSong(song.song_link)}${samplesBundle.test(song.song) ? '.zip' : ''}`,
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
			const samplesLink = SAMPLES_OVERRIDE[song.song_link] ?? song.song_link.replace(samplesBundle, (m, s, p, d) => `${s}${samplesPrefix[p]}${d}`);
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
			fs.writeFileSync(sanitizeSong(song.song_link), file);
		}
		return splitSong(title, {
			...song,
			song: sanitizeSong(song.song),
			size,
			song_link: `${source}/${sanitizeSong(song.song_link)}${samplesBundle.test(song.song) ? '.zip' : ''}`,
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
	'Pinball Illusions': {
		'pru2.intro': [0, 52],
		'pru2.t1_law_n_justice-music': [ 0, 1, 13, 18, 22, 25, 27, 31, 38, 47, 48, 49, 51, 52, 59, 60, 66 ],
		'pru2.t1_law_n_justice-sfx': [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 ],
		'pru2.t2_babewatch-music': [ 0, 1, 16, 17, 29, 30, 51, 57, 63, 64, 68, 70, 73, 75, 76, 77 ],
		'pru2.t2_babewatch-sfx': [ 0, 1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 17, 19, 20, 21, 22, 23, 24, 27 ],
		'pru2.t3_extreme_sports-music': [ 0, 1, 18, 21, 25, 30, 35, 37, 41, 43, 48, 51, 55, 58, 61, 62, 63, 64, 66, 67, 68, 69 ],
		'pru2.t3_extreme_sports-sfx': [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15 ],
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
		'https://www.exotica.org.uk/wiki/1869',
		'https://www.exotica.org.uk/wiki/A320_Airbus',
		'https://www.exotica.org.uk/wiki/Aaargh!',
		'https://www.exotica.org.uk/wiki/After_Burner_(88)',
		'https://www.exotica.org.uk/wiki/After_Burner_(89)',
		'https://www.exotica.org.uk/wiki/Agony_(game)',
		'https://www.exotica.org.uk/wiki/Aladdin',
		'https://www.exotica.org.uk/wiki/Alfred_Chicken',
		'https://www.exotica.org.uk/wiki/Alien_Breed',
		'https://www.exotica.org.uk/wiki/Alien_Breed_II_-_The_Horror_Continues',
		'https://www.exotica.org.uk/wiki/Alien_Breed_3D',
		'https://www.exotica.org.uk/wiki/Alien_Breed_3D_2_-_The_Killing_Grounds',
		'https://www.exotica.org.uk/wiki/Alien_Breed_Special_Edition',
		'https://www.exotica.org.uk/wiki/Alien_Breed:_Tower_Assault',
		'https://www.exotica.org.uk/wiki/All_New_World_Of_Lemmings',
		'https://www.exotica.org.uk/wiki/ATR_-_All_Terrain_Racing',
		'https://www.exotica.org.uk/wiki/Altered_Beast',
		'https://www.exotica.org.uk/wiki/Amnios',
		'https://www.exotica.org.uk/wiki/Another_World',
		'https://www.exotica.org.uk/wiki/Apidya_(game)',
		'https://www.exotica.org.uk/wiki/Apprentice',
		'https://www.exotica.org.uk/wiki/Arabian_Nights',
		'https://www.exotica.org.uk/wiki/Arkanoid_-_Revenge_of_Doh',
		'https://www.exotica.org.uk/wiki/Arnie',
		'https://www.exotica.org.uk/wiki/Arnie_2',
		'https://www.exotica.org.uk/wiki/Assassin',
		'https://www.exotica.org.uk/wiki/Assassin_Special_Edition',
		'https://www.exotica.org.uk/wiki/Les_Aventures_de_Moktar',
		'https://www.exotica.org.uk/wiki/Awesome_(game)',
		'https://www.exotica.org.uk/wiki/B.C._Kid',
		'https://www.exotica.org.uk/wiki/Baal',
		'https://www.exotica.org.uk/wiki/Banshee',
		'https://www.exotica.org.uk/wiki/Barbarian_II',
		'https://www.exotica.org.uk/wiki/Base_Jumpers',
		'https://www.exotica.org.uk/wiki/Batman_(game)',
		'https://www.exotica.org.uk/wiki/Battle_Squadron_-_The_Destruction_of_the_Barrax_Empire!',
		'https://www.exotica.org.uk/wiki/Behind_the_Iron_Gate',
		'https://www.exotica.org.uk/wiki/Beneath_a_Steel_Sky',
		'https://www.exotica.org.uk/wiki/Benefactor',
		'https://www.exotica.org.uk/wiki/Beverly_Hills_Cop',
		'https://www.exotica.org.uk/wiki/Big_Nose_the_Caveman',
		'https://www.exotica.org.uk/wiki/The_Big_Red_Adventure',
		'https://www.exotica.org.uk/wiki/Black_Viper',
		'https://www.exotica.org.uk/wiki/Blastar',
		'https://www.exotica.org.uk/wiki/Blood_Money',
		'https://www.exotica.org.uk/wiki/The_Blues_Brothers',
		'https://www.exotica.org.uk/wiki/Body_Blows',
		'https://www.exotica.org.uk/wiki/Body_Blows_(AGA)',
		'https://www.exotica.org.uk/wiki/Body_Blows_Galactic',
		'https://www.exotica.org.uk/wiki/Bomb_Mania',
		'https://www.exotica.org.uk/wiki/Boulder_Dash',
		'https://www.exotica.org.uk/wiki/Brian_The_Lion_-_Starring_In_Rumble_In_The_Jungle',
		'https://www.exotica.org.uk/wiki/Brutal_Football',
		'https://www.exotica.org.uk/wiki/Bubba_%27n%27_Stix',
		'https://www.exotica.org.uk/wiki/Bubble_and_Squeak',
		'https://www.exotica.org.uk/wiki/Bubble_Bobble',
		'https://www.exotica.org.uk/wiki/Budokan_-_The_Martial_Spirit',
		'https://www.exotica.org.uk/wiki/Bump_%27n%27_Burn',
		'https://www.exotica.org.uk/wiki/Burntime',
		'https://www.exotica.org.uk/wiki/Cabal',
		'https://www.exotica.org.uk/wiki/Cadaver_(game)',
		'https://www.exotica.org.uk/wiki/Capital_Punishment',
		'https://www.exotica.org.uk/wiki/Chambers_of_Shaolin',
		'https://www.exotica.org.uk/wiki/Cannon_Fodder',
		'https://www.exotica.org.uk/wiki/Cannon_Fodder_2',
		'https://www.exotica.org.uk/wiki/Castle_Master',
		'https://www.exotica.org.uk/wiki/Castlevania',
		'https://www.exotica.org.uk/wiki/The_Chaos_Engine',
		'https://www.exotica.org.uk/wiki/The_Chaos_Engine_2',
		'https://www.exotica.org.uk/wiki/Chase_H.Q.',
		'https://www.exotica.org.uk/wiki/Christmas_Lemmings_1993',
		'https://www.exotica.org.uk/wiki/Chuck_Rock',
		'https://www.exotica.org.uk/wiki/Chuck_Rock_2_-_Son_of_Chuck',
		'https://www.exotica.org.uk/wiki/Civilization',
		'https://www.exotica.org.uk/wiki/Colonization',
		'https://www.exotica.org.uk/wiki/Colorado',
		'https://www.exotica.org.uk/wiki/Commando',
		'https://www.exotica.org.uk/wiki/Cool_Spot',
		'https://www.exotica.org.uk/wiki/Covert_Action',
		'https://www.exotica.org.uk/wiki/Crazy_Cars',
		'https://www.exotica.org.uk/wiki/Crazy_Cars_II',
		'https://www.exotica.org.uk/wiki/Crazy_Cars_III',
		'https://www.exotica.org.uk/wiki/Crystal_Hammer',
		'https://www.exotica.org.uk/wiki/Cubulus',
		'https://www.exotica.org.uk/wiki/Curse_of_Enchantia',
		'https://www.exotica.org.uk/wiki/Cybernetix_-_The_First_Battle',
		'https://www.exotica.org.uk/wiki/Dangerous_Streets',
		'https://www.exotica.org.uk/wiki/Dan_Dare_III_-_The_Escape!',
		'https://www.exotica.org.uk/wiki/Days_of_Thunder',
		'https://www.exotica.org.uk/wiki/Death_Mask',
		'https://www.exotica.org.uk/wiki/Defender_of_the_Crown',
		'https://www.exotica.org.uk/wiki/Deflektor',
		'https://www.exotica.org.uk/wiki/Desert_Strike_-_Return_To_The_Gulf',
		'https://www.exotica.org.uk/wiki/Diggers',
		'https://www.exotica.org.uk/wiki/Dogs_of_War',
		'https://www.exotica.org.uk/wiki/Dojo_Dan',
		'https://www.exotica.org.uk/wiki/Donkey_Kong',
		'https://www.exotica.org.uk/wiki/Double_Dragon',
		'https://www.exotica.org.uk/wiki/Double_Dragon_II_-_The_Revenge',
		'https://www.exotica.org.uk/wiki/Double_Dragon_III_-_The_Rosetta_Stone',
		'https://www.exotica.org.uk/wiki/Dragonflight',
		'https://www.exotica.org.uk/wiki/Dune_(game)',
		'https://www.exotica.org.uk/wiki/Dune_II_-_The_Battle_for_Arrakis',
		'https://www.exotica.org.uk/wiki/Dungeon_Master_II_-_The_Legend_of_Skullkeep',
		'https://www.exotica.org.uk/wiki/Dynatech',
		'https://www.exotica.org.uk/wiki/Dyna_Blaster',
		'https://www.exotica.org.uk/wiki/Elf_(game)',
		'https://www.exotica.org.uk/wiki/Elfmania',
		'https://www.exotica.org.uk/wiki/Elite_(game)',
		'https://www.exotica.org.uk/wiki/Frontier_-_Elite_II',
		'https://www.exotica.org.uk/wiki/Elvira',
		'https://www.exotica.org.uk/wiki/Elvira_II_-_The_Jaws_of_Cerberus',
		'https://www.exotica.org.uk/wiki/Elvira_the_Arcade_Game',
		'https://www.exotica.org.uk/wiki/Enchanted_Land',
		'https://www.exotica.org.uk/wiki/Escape_from_Colditz',
		'https://www.exotica.org.uk/wiki/Escape_from_the_Planet_of_the_Robot_Monsters',
		'https://www.exotica.org.uk/wiki/European_Champions',
		'https://www.exotica.org.uk/wiki/F/A-18_Interceptor',
		'https://www.exotica.org.uk/wiki/The_Faery_Tale_Adventure',
		'https://www.exotica.org.uk/wiki/Fears',
		'https://www.exotica.org.uk/wiki/Final_Fight',
		'https://www.exotica.org.uk/wiki/Fire_%26_Ice_-_The_Daring_Adventures_Of_Cool_Coyote',
		'https://www.exotica.org.uk/wiki/First_Samurai',
		'https://www.exotica.org.uk/wiki/Fist_Fighter',
		'https://www.exotica.org.uk/wiki/Flashback',
		'https://www.exotica.org.uk/wiki/Full_Contact',
		'https://www.exotica.org.uk/wiki/Fury_of_the_Furries',
		'https://www.exotica.org.uk/wiki/Fuzzball',
		'https://www.exotica.org.uk/wiki/Galactic_-_The_X%27mas_Edition',
		'https://www.exotica.org.uk/wiki/Galaga%2792',
		'https://www.exotica.org.uk/wiki/Garfield_%22Big,_Fat,_Hairy_Deal%22',
		'https://www.exotica.org.uk/wiki/Garfield_-_Winter%27s_Tail',
		'https://www.exotica.org.uk/wiki/Gauntlet_II',
		'https://www.exotica.org.uk/wiki/Ghosts_%27n_Goblins',
		'https://www.exotica.org.uk/wiki/Ghouls_%27n%27_Ghosts',
		'https://www.exotica.org.uk/wiki/Global_Gladiators',
		'https://www.exotica.org.uk/wiki/Gloom_(game)',
		'https://www.exotica.org.uk/wiki/Gobliiins',
		'https://www.exotica.org.uk/wiki/Gods_(game)',
		'https://www.exotica.org.uk/wiki/Golden_Axe',
		'https://www.exotica.org.uk/wiki/Grand_Monster_Slam',
		'https://www.exotica.org.uk/wiki/The_Great_Giana_Sisters',
		'https://www.exotica.org.uk/wiki/Harlequin',
		'https://www.exotica.org.uk/wiki/Harley-Davidson_-_The_Road_To_Sturgis',
		'https://www.exotica.org.uk/wiki/Heimdall',
		'https://www.exotica.org.uk/wiki/Heimdall_2',
		'https://www.exotica.org.uk/wiki/Hero_Quest',
		'https://www.exotica.org.uk/wiki/Hero_Quest_II_-_Legacy_of_Soracil',
		'https://www.exotica.org.uk/wiki/Hill_Street_Blues',
		'https://www.exotica.org.uk/wiki/Hired_Guns',
		'https://www.exotica.org.uk/wiki/Holiday_Lemmings_1994',
		'https://www.exotica.org.uk/wiki/Hook',
		'https://www.exotica.org.uk/wiki/The_Humans',
		'https://www.exotica.org.uk/wiki/Hybris',
		'https://www.exotica.org.uk/wiki/IK%2B',
		'https://www.exotica.org.uk/wiki/Indiana_Jones_and_the_Last_Crusade_-_The_Action_Game',
		'https://www.exotica.org.uk/wiki/Indiana_Jones_and_the_Last_Crusade_-_The_Graphic_Adventure',
		'https://www.exotica.org.uk/wiki/Indiana_Jones_and_the_Fate_of_Atlantis_-_The_Action_Game',
		'https://www.exotica.org.uk/wiki/It_Came_From_The_Desert',
		'https://www.exotica.org.uk/wiki/Jaguar_XJ220',
		'https://www.exotica.org.uk/wiki/James_Pond_-_Underwater_Agent',
		'https://www.exotica.org.uk/wiki/James_Pond_2_-_Codename_RoboCod',
		'https://www.exotica.org.uk/wiki/James_Pond%C2%B3_-_Operation_Starfi5h',
		'https://www.exotica.org.uk/wiki/Jim_Power_in_%22Mutant_Planet%22',
		'https://www.exotica.org.uk/wiki/Joe_%26_Mac_-_Caveman_Ninja',
		'https://www.exotica.org.uk/wiki/Jumping_Jack%27Son',
		'https://www.exotica.org.uk/wiki/Jungle_Strike',
		'https://www.exotica.org.uk/wiki/Kajko_i_Kokosz',
		'https://www.exotica.org.uk/wiki/Katakis',
		'https://www.exotica.org.uk/wiki/KGB_(game)',
		'https://www.exotica.org.uk/wiki/Kikstart_II',
		'https://www.exotica.org.uk/wiki/The_Killing_Game_Show',
		'https://www.exotica.org.uk/wiki/Kult',
		'https://www.exotica.org.uk/wiki/Lamborghini_American_Challenge',
		'https://www.exotica.org.uk/wiki/Laser_Squad',
		'https://www.exotica.org.uk/wiki/Last_Action_Hero',
		'https://www.exotica.org.uk/wiki/Last_Ninja_2_-_Back_with_a_Vengeance',
		'https://www.exotica.org.uk/wiki/Last_Ninja_3',
		'https://www.exotica.org.uk/wiki/Legend_of_Kyrandia_-_Book_One',
		'https://www.exotica.org.uk/wiki/Lemmings',
		'https://www.exotica.org.uk/wiki/Lemmings_2_-_The_Tribes',
		'https://www.exotica.org.uk/wiki/Lethal_Weapon',
		'https://www.exotica.org.uk/wiki/Liberation_-_Captive_II',
		'https://www.exotica.org.uk/wiki/Lionheart',
		'https://www.exotica.org.uk/wiki/The_Lion_King',
		'https://www.exotica.org.uk/wiki/Loom',
		'https://www.exotica.org.uk/wiki/Lost_Patrol',
		'https://www.exotica.org.uk/wiki/The_Lost_Vikings',
		'https://www.exotica.org.uk/wiki/Lotus_Esprit_Turbo_Challenge',
		'https://www.exotica.org.uk/wiki/Lotus_Turbo_Challenge_2',
		'https://www.exotica.org.uk/wiki/Lotus_III_-_The_Ultimate_Challenge',
		'https://www.exotica.org.uk/wiki/Magic_Pockets',
		'https://www.exotica.org.uk/wiki/Marble_Madness',
		'https://www.exotica.org.uk/wiki/Masterblazer',
		'https://www.exotica.org.uk/wiki/Mean_Arenas',
		'https://www.exotica.org.uk/wiki/Mega-Lo-Mania',
		'https://www.exotica.org.uk/wiki/Mentor',
		'https://www.exotica.org.uk/wiki/Mercs',
		'https://www.exotica.org.uk/wiki/Metal_Mutant',
		'https://www.exotica.org.uk/wiki/Micro_Machines_-_The_Original_Scale_Miniatures',
		'https://www.exotica.org.uk/wiki/Midnight_Resistance',
		'https://www.exotica.org.uk/wiki/Moonstone_-_A_Hard_Days_Knight',
		'https://www.exotica.org.uk/wiki/Morph',
		'https://www.exotica.org.uk/wiki/Mortal_Kombat',
		'https://www.exotica.org.uk/wiki/Mortal_Kombat_II',
		'https://www.exotica.org.uk/wiki/Mr._Nutz_-_Hoppin%27_Mad',
		'https://www.exotica.org.uk/wiki/Myth_-_History_in_the_Making',
		'https://www.exotica.org.uk/wiki/Narco_Police',
		'https://www.exotica.org.uk/wiki/Navy_SEALs',
		'https://www.exotica.org.uk/wiki/The_Newzealand_Story',
		'https://www.exotica.org.uk/wiki/Nicky_Boom',
		'https://www.exotica.org.uk/wiki/Nicky_Boom_II',
		'https://www.exotica.org.uk/wiki/The_Ninja_Warriors',
		'https://www.exotica.org.uk/wiki/Nitro',
		'https://www.exotica.org.uk/wiki/Oh_No!_More_Lemmings',
		'https://www.exotica.org.uk/wiki/Oil_Imperium',
		'https://www.exotica.org.uk/wiki/Oldtimer',
		// 'https://www.exotica.org.uk/wiki/Operation_Wolf', // invalid MODs
		'https://www.exotica.org.uk/wiki/Oscar',
		'https://www.exotica.org.uk/wiki/Out_Run',
		'https://www.exotica.org.uk/wiki/Out_Run_Europa',
		'https://www.exotica.org.uk/wiki/Overdrive_(game)',
		'https://www.exotica.org.uk/wiki/P.P._Hammer_and_His_Pneumatic_Weapon',
		'https://www.exotica.org.uk/wiki/Pac-Land',
		'https://www.exotica.org.uk/wiki/Pac-Mania',
		'https://www.exotica.org.uk/wiki/Pang',
		'https://www.exotica.org.uk/wiki/Paperboy',
		'https://www.exotica.org.uk/wiki/Paradroid_90',
		'https://www.exotica.org.uk/wiki/Paws_of_Fury',
		'https://www.exotica.org.uk/wiki/Perihelion_-_The_Prophecy',
		'https://www.exotica.org.uk/wiki/Pierre_Le_Chef_is_Out_to_Lunch',
		'https://www.exotica.org.uk/wiki/Pinball_Dreams',
		'https://www.exotica.org.uk/wiki/Pinball_Fantasies',
		'https://www.exotica.org.uk/wiki/Pinball_Illusions',
		'https://www.exotica.org.uk/wiki/Pinball_Magic',
		'https://www.exotica.org.uk/wiki/Pinball_Prelude',
		'https://www.exotica.org.uk/wiki/Pipe_Dream',
		'https://www.exotica.org.uk/wiki/Pipe_Mania!!',
		'https://www.exotica.org.uk/wiki/Pit-Fighter',
		'https://www.exotica.org.uk/wiki/Platoon',
		'https://www.exotica.org.uk/wiki/Pool_of_Radiance',
		'https://www.exotica.org.uk/wiki/Pools_of_Darkness',
		'https://www.exotica.org.uk/wiki/Populous',
		'https://www.exotica.org.uk/wiki/Powermonger',
		'https://www.exotica.org.uk/wiki/A_Prehistoric_Tale',
		'https://www.exotica.org.uk/wiki/Prehistorik',
		'https://www.exotica.org.uk/wiki/Premiere',
		'https://www.exotica.org.uk/wiki/Primal_Rage',
		'https://www.exotica.org.uk/wiki/Project-X',
		'https://www.exotica.org.uk/wiki/Project-X_(Revised_Edition)',
		'https://www.exotica.org.uk/wiki/Push-Over',
		'https://www.exotica.org.uk/wiki/Puzznic',
		'https://www.exotica.org.uk/wiki/Qwak',
		'https://www.exotica.org.uk/wiki/R-Type',
		'https://www.exotica.org.uk/wiki/R-Type_II',
		'https://www.exotica.org.uk/wiki/Rainbow_Islands_-_The_Story_of_Bubble_Bobble_2',
		'https://www.exotica.org.uk/wiki/Rajd_Przez_Polske',
		'https://www.exotica.org.uk/wiki/Rick_Dangerous',
		'https://www.exotica.org.uk/wiki/Rick_Dangerous_2',
		'https://www.exotica.org.uk/wiki/Rise_of_the_Robots',
		'https://www.exotica.org.uk/wiki/Risky_Woods',
		'https://www.exotica.org.uk/wiki/Road_Rash',
		'https://www.exotica.org.uk/wiki/RoboCop',
		'https://www.exotica.org.uk/wiki/RoboCop_2',
		'https://www.exotica.org.uk/wiki/RoboCop_3',
		'https://www.exotica.org.uk/wiki/Rock_%27n_Roll',
		'https://www.exotica.org.uk/wiki/Rodland',
		'https://www.exotica.org.uk/wiki/Ruff_%27n%27_Tumble',
		'https://www.exotica.org.uk/wiki/The_Secret_of_Monkey_Island',
		'https://www.exotica.org.uk/wiki/Second_Samurai',
		'https://www.exotica.org.uk/wiki/Seek_%26_Destroy',
		'https://www.exotica.org.uk/wiki/Sensible_Soccer',
		'https://www.exotica.org.uk/wiki/The_Settlers',
		'https://www.exotica.org.uk/wiki/Shadow_Dancer',
		'https://www.exotica.org.uk/wiki/Shadow_Fighter',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast_II',
		'https://www.exotica.org.uk/wiki/Shadow_of_the_Beast_III',
		'https://www.exotica.org.uk/wiki/Shadow_Warriors',
		'https://www.exotica.org.uk/wiki/Shanghai',
		'https://www.exotica.org.uk/wiki/Shaq-Fu',
		'https://www.exotica.org.uk/wiki/Shockwave',
		'https://www.exotica.org.uk/wiki/Silk_Worm',
		'https://www.exotica.org.uk/wiki/Simon_the_Sorcerer',
		'https://www.exotica.org.uk/wiki/Sink_or_Swim',
		'https://www.exotica.org.uk/wiki/Skeleton_Krew',
		'https://www.exotica.org.uk/wiki/Skidmarks',
		'https://www.exotica.org.uk/wiki/Slam_Tilt',
		'https://www.exotica.org.uk/wiki/Sleepwalker',
		'https://www.exotica.org.uk/wiki/Soccer_Kid',
		'https://www.exotica.org.uk/wiki/Space_Crusade_-_The_Ultimate_Encounter',
		'https://www.exotica.org.uk/wiki/Space_Harrier',
		'https://www.exotica.org.uk/wiki/Space_Harrier_II',
		'https://www.exotica.org.uk/wiki/Space_Hulk',
		'https://www.exotica.org.uk/wiki/Speedball',
		'https://www.exotica.org.uk/wiki/Speedball_2_-_Brutal_Deluxe',
		'https://www.exotica.org.uk/wiki/The_Spy_Who_Loved_Me',
		'https://www.exotica.org.uk/wiki/Star_Wars_-_The_Empire_Strikes_Back',
		'https://www.exotica.org.uk/wiki/Star_Wars_-_Return_of_the_Jedi',
		'https://www.exotica.org.uk/wiki/Stardust',
		'https://www.exotica.org.uk/wiki/Steg_the_Slug',
		'https://www.exotica.org.uk/wiki/Street_Fighter',
		'https://www.exotica.org.uk/wiki/Street_Fighter_II',
		'https://www.exotica.org.uk/wiki/Strider',
		'https://www.exotica.org.uk/wiki/Strider_II',
		'https://www.exotica.org.uk/wiki/Superfrog',
		'https://www.exotica.org.uk/wiki/Super_C',
		'https://www.exotica.org.uk/wiki/Super_Cars',
		'https://www.exotica.org.uk/wiki/Super_Cars_II',
		'https://www.exotica.org.uk/wiki/Super_Stardust',
		'https://www.exotica.org.uk/wiki/Super_Street_Fighter_II_Turbo',
		'https://www.exotica.org.uk/wiki/Super_Street_Fighter_II_-_The_New_Challengers',
		'https://www.exotica.org.uk/wiki/Super_Wonder_Boy_in_Monster_Land',
		'https://www.exotica.org.uk/wiki/SWIV',
		'https://www.exotica.org.uk/wiki/Sword_of_Sodan',
		'https://www.exotica.org.uk/wiki/Syndicate_(game)',
		'https://www.exotica.org.uk/wiki/Teenage_Mutant_Hero_Turtles_(game)',
		'https://www.exotica.org.uk/wiki/Teenage_Mutant_Hero_Turtles_-_The_Coin-Op!',
		'https://www.exotica.org.uk/wiki/Teenage_Mutant_Ninja_Turtles_(game)',
		'https://www.exotica.org.uk/wiki/Terminator_II',
		'https://www.exotica.org.uk/wiki/T2:_The_Arcade_Game',
		'https://www.exotica.org.uk/wiki/Test_Drive_II_-_The_Duel',
		'https://www.exotica.org.uk/wiki/Tetris',
		'https://www.exotica.org.uk/wiki/Tetris_Pro',
		'https://www.exotica.org.uk/wiki/Thundercats_(game)',
		'https://www.exotica.org.uk/wiki/Titus_the_Fox',
		'https://www.exotica.org.uk/wiki/Toki',
		'https://www.exotica.org.uk/wiki/Total_Recall',
		'https://www.exotica.org.uk/wiki/Traps_%27n%27_Treasures',
		'https://www.exotica.org.uk/wiki/Treasure_Trap',
		'https://www.exotica.org.uk/wiki/Trolls',
		'https://www.exotica.org.uk/wiki/Turbo_Out_Run',
		'https://www.exotica.org.uk/wiki/Turrican',
		'https://www.exotica.org.uk/wiki/Turrican_II_-_The_Final_Fight',
		'https://www.exotica.org.uk/wiki/Turrican_3',
		'https://www.exotica.org.uk/wiki/TwinTris',
		'https://www.exotica.org.uk/wiki/Ugh!',
		'https://www.exotica.org.uk/wiki/The_Ultimate_Pinball_Quest',
		'https://www.exotica.org.uk/wiki/Ultima_V',
		'https://www.exotica.org.uk/wiki/Ultima_VI_-_The_False_Prophet',
		'https://www.exotica.org.uk/wiki/Universe_(game)',
		'https://www.exotica.org.uk/wiki/Unreal_(game)',
		'https://www.exotica.org.uk/wiki/Utopia_-_The_Creation_of_a_Nation',
		'https://www.exotica.org.uk/wiki/Valhalla_%26_the_Lord_of_Infinity',
		'https://www.exotica.org.uk/wiki/Valhalla_-_Before_the_War',
		'https://www.exotica.org.uk/wiki/Valhalla_%26_the_Fortress_of_Eve',
		'https://www.exotica.org.uk/wiki/Venus_the_Flytrap',
		'https://www.exotica.org.uk/wiki/Walker',
		'https://www.exotica.org.uk/wiki/Wings',
		'https://www.exotica.org.uk/wiki/Wings_of_Death',
		'https://www.exotica.org.uk/wiki/Wings_of_Fury',
		'https://www.exotica.org.uk/wiki/Wizball',
		'https://www.exotica.org.uk/wiki/Wolfchild',
		'https://www.exotica.org.uk/wiki/Wonderdog',
		'https://www.exotica.org.uk/wiki/Worms_-_The_Director%27s_Cut',
		'https://www.exotica.org.uk/wiki/Wrath_of_the_Demon',
		'https://www.exotica.org.uk/wiki/X-IT',
		'https://www.exotica.org.uk/wiki/X-Out_(game)',
		'https://www.exotica.org.uk/wiki/Xenon_(game)',
		'https://www.exotica.org.uk/wiki/Xenon_2_-_Megablast',
		'https://www.exotica.org.uk/wiki/Yo!_Joe!',
		'https://www.exotica.org.uk/wiki/Z-Out',
		'https://www.exotica.org.uk/wiki/Za_Zelazna_Brama',
		'https://www.exotica.org.uk/wiki/Zeewolf',
		'https://www.exotica.org.uk/wiki/Zeewolf_2_-_Wild_Justice',
		'https://www.exotica.org.uk/wiki/Zool_-_Ninja_of_the_%22Nth%22_Dimension',
		'https://www.exotica.org.uk/wiki/Zool_2',
	];
	return (await sequential(games.map(game => () => fetchGame(game, source)))).filter(game => game);
};

exports.fetchUnexotica = fetchUnexotica;

if (require.main === module) {
	const song = process.argv[2];
	console.log(splitSong(undefined, { song, song_link: '' }, new Uint8Array(fs.readFileSync(song))));
}
