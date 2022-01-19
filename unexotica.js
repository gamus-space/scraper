'use strict';

const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');
const AdmZip = require('adm-zip');
const LHA = require('./lib/lha');

const PLATFORM = 'Amiga';

const ARCHIVE_PATH_BUGS = {
	'Risky_Woods\\mod.Risky Woods - Grand       ': 'Risky_Woods\\mod.Risky Woods - Grand',
};

const GAME_DUPLICATES = [
	'https://www.exotica.org.uk/wiki/Body_Blows_(AGA)',
];

function takeUntil(a, e) {
	return a.slice(0, a.indexOf(e));
}

async function fetchGame(url, source) {
	const samplesBundle = /(^|\/)(rjp|jpn|mdat)(\.)/;
	const samplesPrefix = { rjp: 'smp', jpn: 'smp', mdat: 'smpl' };
	if (GAME_DUPLICATES.includes(url))
		return null;

	const html = await (await fetch(url)).text();
	const doc = new dom().parseFromString(html);
	const infobox = xpath.select1("//table[contains(@class, 'infobox')]", doc);
	const title = xpath.select("normalize-space(.//tr[1]/th/i)", infobox);
	//const composers = xpath.select(".//tr[normalize-space(th/text()) = 'Composer(s)']/td/a/text()", infobox).map(t => t.data);
	const developers = xpath.select(".//tr[normalize-space(th/text()) = 'Team(s)']/td/a/text()", infobox).map(t => t.data);
	const publishers = xpath.select(".//tr[normalize-space(th/text()) = 'Publisher(s)']/td/a/text()", infobox).map(t => t.data);
	const year = parseInt(xpath.select("normalize-space(.//tr[normalize-space(th/text()) = 'Year published']/td)", infobox)) || null;
	const music = xpath.select1("//h2/span[normalize-space() = 'UnExoticA Music Files']", doc);
	const followingHeaders = xpath.select("../following-sibling::*[name() = 'h3' or name() = 'h2' or name() = 'h1']", music);
	const nextSection = followingHeaders.find(h => h.nodeName != 'h3');
	const childHeaders = takeUntil(followingHeaders, nextSection).filter(h => !/CDDA/.test(h.textContent));
	//const childChapters = childHeaders.map((h, i) => takeUntil(xpath.select("./following-sibling::*", h), childHeaders[i+1] || nextSection));
	console.log(title, childHeaders.map(h => xpath.select("string(./span[1]/@id)", h)));
	const urls = childHeaders.map(h => xpath.select1("string(./following-sibling::*//a/@href)", h));
	const tables = childHeaders.map(h => xpath.select1("./following-sibling::table[contains(@class, 'filetable')]", h));
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
		return dir || /(^|\/)(smpl?\.|instruments\/|Art_and_Magic_Player_Source\/)/.test(song) ?
			null : { song, song_link, size, composer };
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
			return splitSong({
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
		return splitSong({
			...song,
			size,
			song_link: `${source}/${song.song_link}${samplesBundle.test(song.song) ? '.zip' : ''}`,
			source_archive: urls[i],
		}, file);
	})).flat(2);

	return {
		game: title, platform: PLATFORM, developers, publishers, year, source, source_link: url, songs,
	};
}

function splitSong(song, file) {
	let subsongs = [];
	if (/(^|\/)mdat(\.)/.test(song.song))
		subsongs = splitSongTFMX(song, file);
	if (/(^|\/)mod(\.)/.test(song.song))
		subsongs = splitSongMOD(song, file);
	return subsongs.length <= 1 ? [song] : subsongs.map(i => ({
		...song,
		song: `${song.song} #${i}`,
		song_link: `${song.song_link}#${i}`,
	}));
}

function splitSongTFMX(song, file) {
	const entry = file.getEntry(path.basename(song.song));
	const data = new entry.getData();
	if (String.fromCharCode.apply(null, data.slice(0, 10)) !== "TFMX-SONG ")
		return [];
	data.swap16();
	const data16 = new Uint16Array(data.buffer, data.byteOffset, data.length / 2);

	const songStart = data16.slice(128, 128 + 32);
	const songEnd = data16.slice(128 + 32, 128 + 64);
	const songRanges = Array.from(songStart).map((start, i) => {
		const end = songEnd[i];
		if (songStart.slice(0, i).includes(start) && songEnd.slice(0, i).includes(end))
			return [null, null];
		if ((start === 0 && end === 0) || (start === 511 && end === 511))
			return [null, null];
		return [start, end];
	});
	const subsongs = songRanges.map(([start, end], i) => {
		return (start === null && end === null) ? null : i+1;
	}).filter(i => i != null);
	return subsongs;
}

function splitSongMOD(song, data) {
	//console.log('*', song.song, data.length);
	if (String.fromCharCode.apply(null, data.slice(952, 956)) === "KRIS")
		return chiptracker(data);
	else
		return soundtracker(data);
}

function soundtracker(data) {
	let samples = 31;
	let channels = 4;
	let signature = String.fromCharCode.apply(null, data.slice(1080, 1084));
	switch (signature) {
	case "M.K.":
	case "M!K!":
	case "4CHN":
	case "FLT4":
		break;
	case "6CHN":
		channels = 6;
		break;
	case "8CHN":
	case "FLT8":
		channels = 8;
		break;
	case "28CH":
		channels = 28;
		break;
	default:
		signature = "";
		samples = 15;
	}
	//console.log(signature || 'orig', { samples, channels });

	let p = 20 + 30*samples + 0;
	const length = data[p++];
	const repeat = data[p] === 0x7f ? 0 : data[p];
	p++;
	const trackIndex = new Uint8Array(128);
	let patterns = 0;
	for (let i = 0; i < trackIndex.length; i++, p++) {
		trackIndex[i] = data[p];
		patterns = Math.max(patterns, trackIndex[i]);
	}
	patterns++;
	p += samples === 15 ? 0 : 4;
	const patternData = data.slice(p, p + patterns*64*channels*4);
	return scan({ channels, length, trackIndex, patternData }, (track, row, chan) => {
		const pattern = ((trackIndex[track] * 64 + row) * channels + chan) * 4;
		return patternData.slice(pattern, pattern+4);
	});
}

function chiptracker(data) {
	//console.log('KRIS');
	const samples = 31;
	const channels = 4;
	let p = 22 + 30*samples + 4;
	const length = data[p++];
	const repeat = data[p++];
	const trackIndex = new Uint8Array(128 * channels);
	let patterns = 0;
	for (let i = 0; i < trackIndex.length; i++, p+=2) {
		trackIndex[i] = data[p];
		patterns = Math.max(patterns, trackIndex[i]);
	}
	patterns++;
	p += 2;
	const patternData = data.slice(p, p + patterns*64*4);
	return scan({ channels, length, trackIndex, patternData }, (track, row, chan) => {
		const pattern = (trackIndex[track*channels+chan] * 64 + row) * 4;
		return patternData.slice(pattern, pattern+4);
	});
}

function scan({ channels, length, trackIndex, patternData }, play) {
	const songs = [];
	const played = new Array(length);
	let state;
	while (true) {
		state = { track: played.findIndex(p => !p), row: 0 };
		if (state.track < 0)
			break;
		songs.push(state.track + 1);
		do {
			state = advance(state, channels, length, played, play);
		} while (state);
	}
	return songs;
}

function advance({ track, row, jump }, channels, length, played, play) {
	if (jump && played[track])
		return null;
	played[track] = true;
	for (let chan = 0; chan < channels; chan++) {
		const note = play(track, row, chan);
		//console.log('play', chan, note);
		switch (note[2] & 0xf) {
		case 0xb:
			return { track: note[3], row: 0, jump: true };
		case 0xd:
			return { track: track+1, row: ((note[3]&0xf0)>>4)*10 + (note[3]&0xf), jump: true };
		}
	};
	if (row < 63)
		return { track, row: row+1 };
	return track < length-1 ? { track: track+1, row: 0, jump: true } : null;
}

async function fetchUnexotica(source) {
	const games = [
		'https://www.exotica.org.uk/wiki/Agony_(game)',
		'https://www.exotica.org.uk/wiki/Aladdin',
		'https://www.exotica.org.uk/wiki/Alien_Breed',
		'https://www.exotica.org.uk/wiki/Alien_Breed_II_-_The_Horror_Continues',
		'https://www.exotica.org.uk/wiki/Alien_Breed_Special_Edition',
		'https://www.exotica.org.uk/wiki/Alien_Breed:_Tower_Assault',
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
		'https://www.exotica.org.uk/wiki/Colorado',
		'https://www.exotica.org.uk/wiki/Cool_Spot',
		'https://www.exotica.org.uk/wiki/Crazy_Cars_III',
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
		'https://www.exotica.org.uk/wiki/IK%2B',
		'https://www.exotica.org.uk/wiki/Jaguar_XJ220',
		'https://www.exotica.org.uk/wiki/Jim_Power_in_%22Mutant_Planet%22',
		'https://www.exotica.org.uk/wiki/Kajko_i_Kokosz',
		'https://www.exotica.org.uk/wiki/Last_Ninja_2_-_Back_with_a_Vengeance',
		'https://www.exotica.org.uk/wiki/Last_Ninja_3',
		'https://www.exotica.org.uk/wiki/Lemmings',
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
		'https://www.exotica.org.uk/wiki/Ugh!',
		'https://www.exotica.org.uk/wiki/Walker',
		'https://www.exotica.org.uk/wiki/Wings_of_Fury',
		'https://www.exotica.org.uk/wiki/Wrath_of_the_Demon',
		'https://www.exotica.org.uk/wiki/Yo!_Joe!',
	];
	return (await games.reduce(async (a, e) => [...await a, await fetchGame(e, source)], [])).filter(game => game);
};

exports.fetchUnexotica = fetchUnexotica;
