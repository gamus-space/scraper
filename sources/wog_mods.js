'use strict';

const fs = require('fs');
const process = require('process');
const { URL } = require('url');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const amiga = require('../lib/amiga');
const { countGalleries, fetchGalleries } = require('../lib/gallery');
const { groupBy, sequential, takeUntil } = require('../lib/utils');

if (require.main === module) {
	const song = process.argv[2];
	console.log(splitSong({ song }, new Uint8Array(fs.readFileSync(song))));
}

const FILES_IGNORE = /\.txt$/i;

const LINKS_FLAT = [
	// Amiga
	{ title: 'Cytadela', site: 'MobyGames', url: 'https://www.mobygames.com/game/13331/citadel/', gallerySection: 'Amiga screenshots' },
	{ title: 'Defender of the Crown', site: 'MobyGames', url: 'https://www.mobygames.com/game/181/defender-of-the-crown/', gallerySection: 'Amiga screenshots' },
	{ title: 'Great Giana Sisters, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/11582/the-great-giana-sisters/', gallerySection: 'Amiga screenshots' },
	{ title: 'Janosik', site: 'MobyGames', url: 'https://www.mobygames.com/game/54771/janosik/', gallerySection: 'Amiga screenshots' },
	{ title: 'Last Ninja Remix, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/1423/the-last-ninja/', gallerySection: 'Amiga screenshots' },
	{ title: 'Lemmings', site: 'MobyGames', url: 'https://www.mobygames.com/game/683/lemmings/', gallerySection: 'Amiga screenshots' },
	{ title: 'Lemmings 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/1603/lemmings-2-the-tribes/', gallerySection: 'Amiga screenshots' },
	{ title: 'All New World Of Lemmings', site: 'MobyGames', url: 'https://www.mobygames.com/game/1752/the-lemmings-chronicles/', gallerySection: 'Amiga screenshots' },
	{ title: 'Oh No! More Lemmings', site: 'MobyGames', url: 'https://www.mobygames.com/game/684/oh-no-more-lemmings/', gallerySection: 'Amiga screenshots' },
	{ title: 'Holiday Lemmings 1994', site: 'MobyGames', url: 'https://www.mobygames.com/game/78986/holiday-lemmings/', gallerySection: 'Amiga screenshots' },
	{ title: 'Sen', site: 'MobyGames', url: 'https://www.mobygames.com/game/66252/sen/', gallerySection: 'Amiga screenshots' },
	{ title: 'Skidmarks 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/7236/super-skidmarks/', gallerySection: 'Amiga CD32 screenshots' },
	{ title: 'Super TaeKwonDo Master', site: 'MobyGames', url: 'https://www.mobygames.com/game/28331/super-taekwondo-master/', gallerySection: 'Amiga screenshots' },
	{ title: 'UFO: Enemy Unknown', site: 'MobyGames', url: 'https://www.mobygames.com/game/521/x-com-ufo-defense/', gallerySection: 'Amiga screenshots' },
	// PC Dos
	{ title: 'Arnie 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/7023/arnie-savage-combat-commando/' },
	{ title: 'Crusader: No Regret', site: 'MobyGames', url: 'https://www.mobygames.com/game/852/crusader-no-regret/' },
	{ title: 'Crusader: No Remorse', site: 'MobyGames', url: 'https://www.mobygames.com/game/851/crusader-no-remorse/' },
	{ title: 'Death Rally', site: 'MobyGames', url: 'https://www.mobygames.com/game/256/death-rally/' },
	{ title: 'Epic Pinball', site: 'MobyGames', url: 'https://www.mobygames.com/game/263/epic-pinball/' },
	{ title: 'Franko: The Crazy Revenge', site: 'MobyGames', url: 'https://www.mobygames.com/game/19197/franko-the-crazy-revenge/' },
	{ title: 'Horde, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/6142/the-horde/' },
	{ title: 'Jazz Jackrabbit', site: 'MobyGames', url: 'https://www.mobygames.com/game/902/jazz-jackrabbit/' },
	{ title: 'Jazz Jackrabbit: Holiday Hare 1994', site: 'MobyGames', url: 'https://www.mobygames.com/game/10026/jazz-jackrabbit-holiday-hare-1994/' },
	{ title: 'Kajko i Kokosz', site: 'MobyGames', url: 'https://www.mobygames.com/game/42485/kajko-i-kokosz/' },
	{ title: 'Lion King, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/2077/the-lion-king/' },
	{ title: 'Micro Machines 2: Turbo Tournament', site: 'MobyGames', url: 'https://www.mobygames.com/game/627/micro-machines-2-turbo-tournament/' },
	{ title: 'One Must Fall 2097', site: 'MobyGames', url: 'https://www.mobygames.com/game/234/one-must-fall-2097/' },
	{ title: 'Pinball Dreams 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/2105/pinball-dreams-ii/' },
	{ title: 'Pinball Dreams Deluxe', site: 'MobyGames', url: 'https://www.mobygames.com/game/46903/pinball-arcade/' },
	// { title: 'Pinball from Future Crew', site: '', url: '' },
	{ title: 'Pinball Mania', site: 'MobyGames', url: 'https://www.mobygames.com/game/6873/pinball-mania/' },
	{ title: 'Pinball World', site: 'MobyGames', url: 'https://www.mobygames.com/game/24135/pinball-world/' },
	{ title: 'Prehistorik 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/525/prehistorik-2/' },
	{ title: 'Psycho Pinball', site: 'MobyGames', url: 'https://www.mobygames.com/game/4944/psycho-pinball/' },
	{ title: 'Super Bubble Mania', site: 'MobyGames', url: 'https://www.mobygames.com/game/35492/super-bubble-mania/' },
	{ title: 'Teenagent', site: 'MobyGames', url: 'https://www.mobygames.com/game/6423/teen-agent/' },
	{ title: 'Terminal Velocity', site: 'MobyGames', url: 'https://www.mobygames.com/game/635/terminal-velocity/' },
	{ title: 'Tux Racer', site: 'MobyGames', url: 'https://www.mobygames.com/game/3021/tux-racer/', gallerySection: 'Windows screenshots' },
	// PC Windows
	{ title: 'Jazz Jackrabbit 2: The Secret Files', site: 'MobyGames', url: 'https://www.mobygames.com/game/9554/jazz-jackrabbit-2-the-secret-files/', gallerySection: 'Windows screenshots' },
	// MIDI
	{ title: 'Hexen II', site: 'MobyGames', url: 'https://www.mobygames.com/game/813/hexen-ii/', gallerySection: 'Windows screenshots' },
	{ title: 'Hexen II: Portal of Praevus', site: 'MobyGames', url: 'https://www.mobygames.com/game/814/hexen-ii-mission-pack-portal-of-praevus/', gallerySection: 'Windows screenshots' },
];
const LINKS = groupBy(LINKS_FLAT, ({ title }) => title);

const EMPTY_GALLERY = [
	'Pinball from Future Crew',
];

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
	const developersEnd = developersStart && xpath.select1("./following-sibling::big", developersStart);
	const developers = developersEnd && takeUntil(xpath.select("./following-sibling::*[name() = 'a' or name() = 'big']", developersStart), developersEnd).map(dev => xpath.select("normalize-space(./text())", dev));
	const publishersStart = xpath.select1("./big[normalize-space(text()) = 'Publishers:' or normalize-space(text()) = 'Publisher:']", gameInfo);
	const publishersEnd = publishersStart && xpath.select1("./following-sibling::big", publishersStart);
	const publishers = publishersEnd && takeUntil(xpath.select("./following-sibling::*[name() = 'a' or name() = 'big']", publishersStart), publishersEnd).map(dev => xpath.select("normalize-space(./text())", dev));

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
			if (entry.entryName.includes('/')) {
				console.info(`skipping sub-directory: ${entry.entryName}`);
				return;
			};
			fs.writeFileSync(`${gameDir}/${entry.name}`, entry.getData());
		});
		files = entries.filter(entry => !entry.entryName.includes('/')).map(entry => entry.name).sort();
	}
	const links = await fetchGalleries(LINKS[game] ?? []);
	const galleryCount = countGalleries(links);
	console.log(game, tunesCount, { gallery: galleryCount });
	if (galleryCount === 0 && !EMPTY_GALLERY.includes(game))
		throw new Error('empty gallery');
	const metaSource = options.source ?? source;
	const samples = options.samples ? { samples: options.samples } : {};
	const songs = files.map(file => ({
		song: file,
		song_link: `${source}/${gameDir}/${file}`,
		size: fs.statSync(`${gameDir}/${file}`).size,
		composer: composers.join(', '),
	})).map(song => splitSong(song, Uint8Array.from(fs.readFileSync(`../${song.song_link}`)))).flat();

	return { game, platform, developers, publishers, year, source: metaSource, source_link: url, links, ...samples, songs };
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
		'Diggers': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzUx',
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
		'Ultima 6': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE2MA==',
		'Walker': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE4Ng==',
		'Yo! Joe!': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTIzMg==',
	};
	const invalidGames = {
		'FX Fighter': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQxNjM=',
		'Monkey Island 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzEz',
		'Xenon 2: Megablast': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTIyNg==',
	};
	const newGames = {
		'Cytadela': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzA4',
		'Defender of the Crown': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzI1',
		'Great Giana Sisters, The': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM4ODY=',
		'Janosik': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTcz',
		'Last Ninja Remix, The': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjIz',
		'Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzk=',
		'Lemmings 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMx',
		'Lemmings 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMy',
		'Oh No! More Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQ0MDY=',
		'Holiday Lemmings': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzg=',
		'Sen': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTE5',
		'Skidmarks 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTU3',
		'Super TaeKwonDo Master': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTA0Nw==',
		'UFO: Enemy Unknown': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE1OA==',
	};
	const pcDosGames = {
		'Arnie 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5NTg=',
		'Crusader: No Regret': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjky',
		'Crusader: No Remorse': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=Mjkz',
		'Death Rally': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MzIw',
		'Epic Pinball': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDAx',
		'Franko: The Crazy Revenge': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDY3',
		'Horde, The': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTQx',
		'Jazz Jackrabbit': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTc2',
		'Jazz Jackrabbit: Holiday Hare 1994': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTc=',
		'Kajko i Kokosz': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQ0ODc=',
		'Lion King': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTQ=',
		'Micro Machines 2: Turbo Tournament': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5OTk=',
		'One Must Fall 2097': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NzYz',
		'Pinball Dreams 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODAy',
		'Pinball Dreams Deluxe': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODAz',
		'Pinball from Future Crew': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODEw',
		'Pinball Mania': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODA3',
		'Pinball World': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODA5',
		'Prehistorik 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=ODIz',
		'Psycho Pinball': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQwMDA=',
		'Super Bubble Mania': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQ0Nzk=',
		'Teenagent': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM2OTI=',
		'Terminal Velocity': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTA2Ng==',
		'Tux Racer': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTE1NQ==',
	};
	const pcWindowsGames = {
		//'Jazz Jackrabbit 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=NTc1',
		'Jazz Jackrabbit 2: The Secret Files': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM4MDU=',
		//'Jazz Jackrabbit 3': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTM5MjI=',
	};
	const midiGames = {
		'Hexen 2': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTg3Mg==',
		'Hexen 2: Portal of Praevus': 'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQxNzA=',
	};
	const gameOptions = {
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=NjMy': { game: 'All New World Of Lemmings' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=NDY3': { game: 'Franko: The Crazy Revenge' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTg3Mg==': { game: 'Hexen II', source: 'World of Game MIDs', samples: 'resources/samples/Windows/msadlib.bnk' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQxNzA=': { game: 'Hexen II: Portal of Praevus', source: 'World of Game MIDs', samples: 'resources/samples/Windows/msadlib.bnk' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTQyMzg=': { game: 'Holiday Lemmings 1994' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=OTU3': { game: 'Skidmarks 2' },
		'http://www.mirsoft.info/gmb/music_info.php?id_ele=MTA0Nw==': { game: 'Super TaeKwonDo Master' },
	};
	const commonOptions = {
		platformMap: { 'PC Dos': 'PC', 'PC Windows': 'PC' },
	};
	const games = { ...newGames, ...pcDosGames, ...pcWindowsGames, ...midiGames };
	return (await sequential(Object.values(games).map(game => () =>
		fetchGame(game, source, { ...commonOptions, ...gameOptions[game] })
	))).filter(game => game);
}

exports.fetchWogMods = fetchWogMods;
