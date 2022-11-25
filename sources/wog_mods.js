'use strict';

const fs = require('fs');
const process = require('process');
const { URL } = require('url');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const amiga = require('../lib/amiga');
const { sequential, takeUntil } = require('../lib/utils');

if (require.main === module) {
	const song = process.argv[2];
	console.log(splitSong({ song }, new Uint8Array(fs.readFileSync(song))));
}

const FILES_IGNORE = /\.txt$/i;

async function fetchGame(url, source, options) {
	const html = await (await fetch(url)).text();
	const doc = new dom({ errorHandler: {
		warning: w => {},
		error: e => {},
		fatalError: e => { console.error(e) },
	}}).parseFromString(html);
	const page = xpath.select1("//span[contains(@class, 'normal')]", doc);

	const gameInfo = xpath.select1("./following::h2[normalize-space(text()) = 'Game info']/following-sibling::p", page);
	const game = options.game || xpath.select1("normalize-space(./big[normalize-space(text()) = 'Name:']/following-sibling::a/text())", gameInfo);
	const developersStart = xpath.select1("./big[normalize-space(text()) = 'Developers:' or normalize-space(text()) = 'Developer:']", gameInfo);
	const developersEnd = xpath.select1("./following-sibling::big", developersStart);
	const developers = takeUntil(xpath.select("./following-sibling::*[name() = 'a' or name() = 'big']", developersStart), developersEnd).map(dev => xpath.select("normalize-space(./text())", dev));
	const publishersStart = xpath.select1("./big[normalize-space(text()) = 'Publishers:' or normalize-space(text()) = 'Publisher:']", gameInfo);
	const publishersEnd = xpath.select1("./following-sibling::big", publishersStart);
	const publishers = takeUntil(xpath.select("./following-sibling::*[name() = 'a' or name() = 'big']", publishersStart), publishersEnd).map(dev => xpath.select("normalize-space(./text())", dev));

	const musicInfo = xpath.select1("./following::h2[normalize-space(text()) = 'Music info']/following-sibling::p", page);
	const platformStr = xpath.select1("normalize-space(./big[normalize-space(text()) = 'Related Plaform:']/following-sibling::a/text())", musicInfo);
	const platform = options.platformMap[platformStr] || platformStr;
	const yearStr = xpath.select1("normalize-space(./big[normalize-space(text()) = 'Released:']/following-sibling::text()[1])", musicInfo);
	const year = yearStr.match(/\d\d\d\d/) && yearStr.match(/\d\d\d\d/)[0];
	const composersStart = xpath.select1("./big[normalize-space(text()) = 'Composer of these tunes:' or normalize-space(text()) = 'Composers of these tunes:']", musicInfo);
	const composersEnd = composersStart && xpath.select1("./following-sibling::big", composersStart);
	const composers = composersStart ? takeUntil(xpath.select("./following-sibling::*[name() = 'a' or name() = 'big']", composersStart), composersEnd).map(dev => xpath.select("normalize-space(./text())", dev)) : ['Unknown'];

	const tunes = Number(xpath.select1("normalize-space(./big[normalize-space(text()) = 'Num of tunes:']/following-sibling::text()[1])", musicInfo));
	const tunesOriginal = Number(xpath.select1("normalize-space(./big[normalize-space(text()) = 'Num of tunes (original):']/following-sibling::text()[1])", musicInfo));
	const tunesActual = Number(xpath.select1("normalize-space(./big[normalize-space(text()) = 'Num of tunes (actual):']/following-sibling::text()[1])", musicInfo));
	const tunesCount = game === 'Gods' ? tunesOriginal : tunes || tunesActual;
	if (tunesCount === 0) throw 'no tunes!';
	console.log(game, tunesCount);

	const gameDir = `${platform}/${game.replace(/:/g, '')}`;
	try {
		fs.mkdirSync(gameDir, { recursive: true });
	} catch {}
	let files = fs.readdirSync(gameDir).filter(file => !file.match(FILES_IGNORE)).sort();
	if (files.length < tunesCount) {
		const downloadInfo = xpath.select1("./following::h2[normalize-space(text()) = 'Music download']/following-sibling::p", page);
		const downloadLink = xpath.select1("string(./a/@href)", downloadInfo);
		const downloadUrl = new URL(downloadLink, url);
		const downloadHtml = await (await fetch(downloadUrl)).text();
		const downloadDoc = new dom({ errorHandler: {
			warning: w => {},
			error: e => {},
			fatalError: e => { console.error(e) },
		}}).parseFromString(downloadHtml);
		const downloadLink2 = xpath.select1("string(//a[normalize-space(text()) = 'On Site download']/@href)", downloadDoc);
		const downloadUrl2 = new URL(downloadLink2, downloadUrl);

		console.info(`downloading ${downloadUrl2} ...`);

		const archive = await (await fetch(downloadUrl2)).arrayBuffer();
		const entries = new AdmZip(Buffer.from(archive)).getEntries().filter(entry => !entry.name.match(FILES_IGNORE));
		entries.forEach(entry => {
			fs.writeFileSync(`${gameDir}/${entry.name}`, entry.getData());
		});
		files = entries.map(entry => entry.name).sort();
	}
	const songs = files.map(file => ({
		song: file,
		song_link: `${source}/${gameDir}/${file}`,
		size: fs.statSync(`${gameDir}/${file}`).size,
		composer: composers.join(', '),
	})).map(song => splitSong(song, Uint8Array.from(fs.readFileSync(`../${song.song_link}`)))).flat();

	return { game, platform, developers, publishers, year, source, source_link: url, songs };
}

function splitSong(song, file) {
	let subsongs = [];
	if (/\.mod$/i.test(song.song))
		subsongs = amiga.splitSongMOD(song, file, { minTrackLength: 2 });
	if (/\.s3m$/i.test(song.song))
		subsongs = amiga.splitSongST3(song, file);
	return subsongs.length <= 1 ? [song] : subsongs.map(i => ({
		...song,
		song: `${song.song} #${i+1}`,
		song_link: `${song.song_link}#${i+1}`,
	}));
}

async function fetchWogMods(source) {
	const coveredGames = {
		'Agony': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Njk=',
		'Aladdin': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzY=',
		'Alien Breed 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODI=',
		'Alien Breed Special Edition 92': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODU=',
		'Alien Breed Tower Assault': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODY=',
		'Another World': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTU=',
		'Apidya': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTg=',
		'Arabian Nights': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTAx',
		'Assassin': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTEy',
		'Body Blows Galactic': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTc1',
		'Body Blows': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTc2',
		'Bubba \'n\' Stix': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjA1',
		'Cannon Fodder': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjIw',
		'Chase HQ': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjQ5',
		'Chaos Engine': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjQ3',
		'Chuck Rock 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjUz',
		'Chuck Rock': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MjU0',
		'Cool Spot': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjc3',
		'Crazy Cars 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjgz',
		'Dojo Dan': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzU0',
		'Double Dragon 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzYx',
		'Double Dragon 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzYy',
		'Dune': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mzgx',
		'Eflmania': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mzk2',
		'Escape from Colditz': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDAz',
		'Final Fight': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDQ4',
		'First Samurai': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDUy',
		'Flashback': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDU0',
		'Full Contact': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDY4',
		'Fury of the Furries': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDcw',
		'Gloom': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDk1',
		'Gobliiins': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDk5',
		'Gods': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTAx',
		'Jaguar XJ220': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTY3',
		'Kajko & Kokosz': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTky',
		'Last Ninja 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjIw',
		'Last Ninja 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM3MzQ=',
		'Lion King': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjM4',
		'Lost Vikings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQxOTg=',
		'Lotus 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjQ5',
		'Lotus Esprit Turbo Challenge': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjUw',
		'Lotus Turbo Challenge 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjQ4',
		'Moonstone': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzIw',
		'Moktar': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzEy',
		'Mortal Kombat 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzIz',
		'Mortal Kombat': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzIy',
		'Myth': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzM0',
		'Nicky Boom': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzQ5',
		'Pang': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Nzgz',
		'Pinball Dreams': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODA0',
		'Pinball Fantasies': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODA1',
		'Prehistorik': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODI0',
		'Project-X': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODMw',
		'Rise of the Robots': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODcx',
		'Risky Woods': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODcy',
		'Road Rash': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODc0',
		'Secret Of Monkey Island': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzE0',
		'Shadow of the Beast 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTMx',
		'Shadow of the Beast 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTMy',
		'Shadow of the Beast': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTMz',
		'Shaq-Fu': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTM5',
		'Soccer Kid': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTY3',
		'Superfrog': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTAyNw==',
		'Sviw': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTA1Mg==',
		'Settlers': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTI0',
		'Titus The Fox': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTEyNw==',
		'Walker': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE4Ng==',
		'Yo! Joe!': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTIzMg==',
	};
	const newGames = {
		'Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzk=',
		'Lemmings 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMx',
		'Lemmings 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMy',
		'Oh No! More Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQ0MDY=',
		'Holiday Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzg=',
	};
	const pcDosGames = {
		'Arnie 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5NTg=',
		'Crusader: No Regret': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjky',
		'Crusader: No Remorse': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjkz',
		'Death Rally': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzIw',
		'Diggers': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzUx',
		'Epic Pinball': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDAx',
		'FX Fighter': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQxNjM=',
		'Jazz Jackrabbit': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTc2',
		'Jazz Jackrabbit: Holiday Hare 1994': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTc=',
		'Lion King': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTQ=',
		'Micro Machines 2: Turbo Tournament': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTk=',
		'One Must Fall 2097': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzYz',
		'Pinball Dreams 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODAy',
		'Pinball Dreams Deluxe': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODAz',
		'Screamer': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTEx',
		'Super Bubble Mania': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQ0Nzk=',
		'Teenagent': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM2OTI=',
		'Terminal Velocity': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTA2Ng==',
		'Ultima 6': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE2MA==',
	};
	const pcWindowsGames = {
		//'Jazz Jackrabbit 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTc1',
		'Jazz Jackrabbit 2: The Secret Files': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM4MDU=',
		//'Jazz Jackrabbit 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5MjI=',
	};
	const gameOptions = {
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzg=': { game: 'Holiday Lemmings 1994' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMy': { game: 'All New World Of Lemmings' },
	};
	const commonOptions = {
		platformMap: { 'PC Dos': 'PC', 'PC Windows': 'PC' },
	};
	const games = { ...newGames, ...pcDosGames, ...pcWindowsGames };
	return (await sequential(Object.values(games).map(game => () =>
		fetchGame(game, source, { ...commonOptions, ...gameOptions[game] })
	))).filter(game => game);
}

exports.fetchWogMods = fetchWogMods;
