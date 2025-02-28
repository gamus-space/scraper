'use strict';

const fs = require('fs');
const { URL } = require('url');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const { countGalleries, fetchGalleries } = require('../lib/gallery');
const { groupBy, indexBy, sequential } = require('../lib/utils');

const PLATFORM_MAP = { 'DOS': 'PC' };

const FIXED_LINKS_FLAT = [
	{ title: 'Commander Keen VI: Aliens Ate My Babysitter!', site: 'MobyGames', url: 'https://www.mobygames.com/game/1581/commander-keen-aliens-ate-my-babysitter/' },
	{ title: 'Cosmo\'s Cosmic Adventure', site: 'MobyGames', url: 'https://www.mobygames.com/game/910/cosmos-cosmic-adventure/' },
	{ title: 'Wolfenstein 3D', site: 'MobyGames', url: 'https://www.mobygames.com/game/306/wolfenstein-3d/' },
];
const FIXED_LINKS = Object.fromEntries(Object.entries(groupBy(FIXED_LINKS_FLAT, ({ site }) => site)).map(([site, links]) => [site, indexBy(links, ({ title }) => title)]));

const EMPTY_GALLERY = [];

async function fetchGame({ url, composer, song_pattern, song_count, song_ignore, rate, samples }, source, options) {
	const html = await (await fetch(url)).text();
	const doc = new dom().parseFromString(html);
	const infoTable = xpath.select1('//div[@id="mw-content-text"]/table[1]', doc);
	const game = options.game || xpath.select('normalize-space(./tr[1]/td)', infoTable);
	const metricsTable = xpath.select1('.//table', infoTable);
	const platformStr = xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Platform:"]/td[2])', metricsTable);
	const platform = PLATFORM_MAP[platformStr] || platformStr;
	const year = parseInt(xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Year:"]/td[2])', metricsTable)) || null;
	const developers = [xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Developer:"]/td[2])', metricsTable)];

	const releasesTitle = xpath.select1('//div[@id="mw-content-text"]//h2[span/@id="Releases"]', doc);
	const releasesTables = xpath.select('./following-sibling::*/descendant-or-self::table//table', releasesTitle);
	const publishers = [...new Set(releasesTables.map(table => xpath.select1('normalize-space(./tr[normalize-space(./td[1]) = "Publisher:"]/td[2])', table)))];

	const ripTitle = xpath.select1('//div[@id="mw-content-text"]//h3[span/@id="Game_Rip"]', doc);
	const mainDownloadLink = xpath.select1('string(./following-sibling::*/descendant-or-self::table[1]//a[normalize-space(text()) = "Download"]/@href)', ripTitle);
	const altDownloadLink = xpath.select1('string(./following-sibling::p//a[normalize-space(text()) = "Download Rip"]/@href)', ripTitle);
	const downloadLink = altDownloadLink || mainDownloadLink;
	const downloadUrl = new URL(downloadLink, url);

	const gameDir = `${platform}/${game.replace(/:/g, '')}`;
	try {
		fs.mkdirSync(gameDir, { recursive: true });
	} catch {}
	let files = fs.readdirSync(gameDir).sort();
	if (files.length < song_count) {
		console.log(`downloading ${downloadUrl} ...`);
		const archive = await (await fetch(downloadUrl)).arrayBuffer();
		const entries = new AdmZip(Buffer.from(archive)).getEntries().filter(entry => entry.entryName.match(song_pattern));
		entries.forEach(entry => {
			fs.writeFileSync(`${gameDir}/${entry.name}`, entry.getData());
		});
		files = entries.map(entry => entry.name).sort();
	}

	const linksTitle = xpath.select1('//div[@id="mw-content-text"]//h2[span/@id="Links"]', doc);
	const links = await fetchGalleries(linksTitle && xpath.select('./following-sibling::ul/li', linksTitle).map(item => ({
		title: game,
		site: /- ?(.+?)\.?$/.exec(xpath.select1('./text()[last()]', item)?.textContent)?.[1],
		url: xpath.select1('string(./a/@href)', item),
	})).map(link => FIXED_LINKS[link.site]?.[link.title] ?? link));
	const galleryCount = countGalleries(links);
	console.log(game, [downloadLink], { gallery: galleryCount });
	if (galleryCount === 0 && !EMPTY_GALLERY.includes(game))
		throw new Error('empty gallery');

	const fragment = rate != undefined ? `#${rate}` : '';
	const songs = files.filter(file => !file.match(song_ignore || /$^/)).map(file => ({
		song: file,
		song_link: `${source}/${gameDir}/${file}${fragment}`,
		size: fs.statSync(`${gameDir}/${file}`).size,
		composer,
		source_archive: downloadUrl.href,
	})).map(song => splitSong(song, game)).flat();
	const samplesLink = samples != undefined ? { samples } : {};

	return { game, platform, developers, publishers, year, source, source_link: url, links, ...samplesLink, songs };
}

function splitSong(song, game) {
	let subsongs = null;
	if (splitSongFixed[game])
		subsongs = splitSongFixed[game][song.song];
	return !subsongs ? [song] : subsongs.map(i => ({
		...song,
		song: `${song.song} #${i+1}`,
		song_link: `${song.song_link}#${i+1}`,
	}));
}

const splitSongFixed = {
	'Dune II': {
		'DUNE0.ADL': [2, 4], // intro, logo
		'DUNE1.ADL': [2, 3, 4, 5, 6], // menu, defeat, defeat, defeat, game
		'DUNE10.ADL': [2, 7], // menu, rush
		'DUNE11.ADL': [7], // rush
		'DUNE12.ADL': [7], // rush
		'DUNE13.ADL': [7], // rush
		'DUNE14.ADL': [7], // rush
		'DUNE15.ADL': [7], // rush
		'DUNE16.ADL': [7, 8], // map, emperor
		'DUNE17.ADL': [4], // ordos
		'DUNE18.ADL': [6], // game
		'DUNE19.ADL': [2, 3, 4], // ending, ending, ending
		'DUNE2.ADL': [6], // game
		'DUNE20.ADL': [2], // credits
		'DUNE3.ADL': [6], // game
		'DUNE4.ADL': [6], // game
		'DUNE5.ADL': [6], // game
		'DUNE6.ADL': [6], // game
		'DUNE7.ADL': [2, 3, 4, 6], // mentat, mentat, mentat, menu
		'DUNE8.ADL': [2, 3], // victory, victory
		'DUNE9.ADL': [4, 5], // game, game
	},
	'Eye of the Beholder': {
		'SOUND.ADL': [1, 2, 3],
	},
	'Eye of the Beholder II: The Legend of Darkmoon': {
		'AZURE.ADL': [52, 54, 55, 57, 59, 61],
		'CATACOMB.ADL': [53, 57, 59],
		'CRIMSON1.ADL': [59, 60, 61, 62],
		'CRIMSON2.ADL': [52, 53, 54, 55, 56],
		'FINALE1.ADL': [1],
		'FINALE2.ADL': [1],
		'FOREST.ADL': [52],
		'INTRO.ADL': [12, 13],
		'MEZANINE.ADL': [52, 53, 58],
		'SILVER.ADL': [54, 55, 59, 60, 61],
	},
	'Jagged Alliance': {
		'DAY.XMI': [1, 2, 3, 4, 5, 6],
		'DAYGM.XMI': [],
		'INTRO.XMI': [1, 2, 3, 4],
		'INTROGM.XMI': [],
		'MENUS.XMI': [1, 2, 3, 4, 5],
		'MENUSGM.XMI': [],
	},
	'Legend of Kyrandia: Book One, The': {
		'intro.adl': [2, 3, 4, 5],
		'kyra1a.adl': [2, 3, 4],
		'kyra1b.adl': [2, 3, 4, 6, 8],
		'kyra2a.adl': [2, 3, 4, 5, 6, 7],
		'kyra3a.adl': [3, 4],
		'kyra4a.adl': [2, 3, 7, 8],
		'kyra4b.adl': [],
		'kyra5a.adl': [2, 3, 4, 5],
		'kyra5b.adl': [2, 5, 8, 9],
		'kyramisc.adl': [2, 3],
	},
	'Legend of Kyrandia: Book Two - The Hand of Fate, The': {
		'K2FINALE.ADL': [2, 3, 4],
		'K2INTRO.ADL': [2, 3, 4, 5, 6, 7, 8],
		'K2SFX.ADL': [],
		'K2TEST1.ADL': [2, 3],
		'K2TEST10.ADL': [2, 3, 4, 5, 6, 7, 8, 9],
		'K2TEST11.ADL': [2, 3, 4, 5, 6, 7],
		'K2TEST12.ADL': [2, 3, 4, 5, 6, 7, 8, 9],
		'K2TEST13.ADL': [2, 3, 4, 5, 6, 7, 8, 9],
		'K2TEST14.ADL': [2],
		'K2TEST15.ADL': [2, 3, 4, 5],
		'K2TEST2.ADL': [2, 3],
		'K2TEST3.ADL': [2, 3],
		'K2TEST4.ADL': [2, 3],
		'K2TEST5.ADL': [2, 3, 4, 5, 6, 7],
		'K2TEST6.ADL': [3, 4],
		'K2TEST7.ADL': [2, 3, 4, 5],
		'K2TEST8.ADL': [2, 3, 4, 5, 6, 7, 8, 9],
		'K2TEST9.ADL': [2, 4, 5, 6, 7, 8, 9],
	},
};

async function fetchVgmpf(source) {
	const imfGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Bio_Menace_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 31 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Blake_Stone:_Aliens_of_Gold_(DOS)', composer: 'Robert Prince', song_pattern: /^Originals\/[^/]+\.IMF/, song_count: 19, rate: 700 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Blake_Stone:_Planet_Strike_(DOS)', composer: 'Robert Prince', song_pattern: /^Originals\/[^/]+\.IMF/, song_count: 21, rate: 700 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Catacomb_3-D_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 1 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Commander_Keen_IV:_Secret_of_the_Oracle_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 6 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Commander_Keen_V:_The_Armageddon_Machine_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 14 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Commander_Keen_VI:_Aliens_Ate_My_Babysitter!_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 9 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Corridor_7:_Alien_Invasion_(DOS)', composer: 'Joe Abbati', song_pattern: /^[^/]+\.imf/, song_count: 29, rate: 700 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Cosmo%27s_Cosmic_Adventure_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.imf/, song_count: 19 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Duke_Nukem_II_(DOS)', composer: 'Robert Prince', song_pattern: /^Original Rip\/Music\/[^/]+\.imf/, song_count: 20, rate: 280 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Hocus_Pocus_(DOS)', composer: 'Rob Wallace', song_pattern: /^Beta\/[^/]+\.imf/, song_count: 11 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Major_Stryker_(DOS)', composer: 'Robert Prince', song_pattern: /^Originals\/[^/]+\.IMF/, song_count: 21 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Monster_Bash_(DOS)', composer: 'Rob Wallace', song_pattern: /^[^/]+\.imf/, song_count: 17 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Operation_Body_Count_(DOS)', composer: 'Joe Abbati', song_pattern: /^Originals\/[^/]+\.IMF/, song_count: 10, rate: 700 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Realms_of_Chaos_(DOS)', composer: 'Robert Prince', song_pattern: /^extra\/imf\/[^/]+\.imf/, song_count: 8 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Spear_of_Destiny_(DOS)', composer: 'Robert Prince', song_pattern: /^IMF\/[^/]+\.wlf/, song_count: 24 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Wolfenstein_3D_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.wlf/, song_count: 27 },
	];
	const musGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Chex_Quest_(DOS)', composer: 'Andrew Benon', song_pattern: /^[^/]+\.mus/, song_count: 8, samples: 'resources/samples/Doom/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Chex_Quest_2_(DOS)', composer: 'Andrew Benon', song_pattern: /^[^/]+\.mus/, song_count: 8, samples: 'resources/samples/Doom/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Doom_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.mus/, song_count: 24, samples: 'resources/samples/Doom/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Doom_II:_Hell_On_Earth_(DOS)', composer: 'Robert Prince', song_pattern: /^[^/]+\.mus/, song_count: 21, samples: 'resources/samples/Doom 2/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Final_DOOM_(DOS)#plutonia', composer: 'Robert Prince', song_pattern: /^originals\/Plutonia\/[^/]+\.MUS/, song_count: 27, samples: 'resources/samples/Doom 2/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Final_DOOM_(DOS)#tnt', composer: 'Robert Prince, Tom Mustaine, Jonathan El-Bizri, Josh Martel, L.A. Sieben', song_pattern: /^originals\/TNT\/[^/]+\.MUS/, song_count: 23, samples: 'resources/samples/Doom 2/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Heretic_(DOS)', composer: 'Kevin Schilder', song_pattern: /^[^/]+\.mus/, song_count: 22, samples: 'resources/samples/Heretic/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Hexen:_Beyond_Heretic_(DOS)', composer: 'Kevin Schilder', song_pattern: /^[^/]+\.mus/, song_count: 37, samples: 'resources/samples/Heretic/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Raptor:_Call_of_the_Shadows_(DOS)', composer: 'Matt Murphy / Scott Host', song_pattern: /^[^/]+\.mus/, song_count: 17, rate: 140, samples: 'resources/samples/Raptor Call of the Shadows/GENMIDI.OP2' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Strife_(DOS)', composer: 'Morey Goldstein', song_pattern: /^[^/]+\.mus/, song_count: 23, samples: 'resources/samples/Strife/GENMIDI.OP2' },
	];
	const mGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Times_of_Lore_(DOS)', composer: 'Martin Galway, Herman Miller', song_pattern: /^Originals\/[^/]+\.m/, song_count: 11 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Ultima_VI:_The_False_Prophet_(DOS)', composer: 'David Watson / Herman Miller / Ken Arnold / Thomas Arne / Todd Porter', song_pattern: /^Originals\/[^/]+\.m/, song_count: 12 },
	];
	const adlWestwoodGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Dune_II:_The_Building_of_a_Dynasty_(DOS)', composer: 'Frank Klepacki, Paul Mudra', song_pattern: /^Originals\/[^/]+\.ADL/, song_count: 21 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Eye_of_the_Beholder_(DOS)', composer: 'Paul Mudra', song_pattern: /^Originals\/AdLib\/SOUND\.ADL/, song_count: 1 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Eye_of_the_Beholder_II:_The_Legend_of_Darkmoon_(DOS)', composer: 'Frank Klepacki', song_pattern: /^Originals\/Music \(AdLib\)\/[^/]+\.ADL/, song_count: 10 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=The_Legend_of_Kyrandia:_Book_One_(DOS)', composer: 'Frank Klepacki', song_pattern: /^Legend of Kyrandia, The - Book 1 \(DOS\)\/Originals\/[^/]+\.adl/, song_count: 10 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=The_Legend_of_Kyrandia:_Book_Two_-_Hand_of_Fate_(DOS)', composer: 'Frank Klepacki', song_pattern: /^Originals\/(AUDIO|INTROGEN).PAK\/[^/]+\.ADL/, song_count: 18 },
	];
	const mdiGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Cannon_Fodder_(DOS)', composer: 'Jon Hare, Nigel Taylor', song_pattern: /^Rip\/[^/]+\.mdi/, song_count: 2 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Golden_Axe_(DOS)', composer: 'SEGA', song_pattern: /^Originals\/Uncompressed\/[^/]+\.MDI/, song_count: 21 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Prehistorik_(DOS)', composer: 'Michel Golgevit, Zorba Kouaik', song_pattern: /^Originals\/Decompressed\/Music \(AdLib\)\/[^/]+\.MDI/, song_count: 9 },
	];
	const xmiGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Blackthorne_(DOS)', composer: 'Glenn Stafford', song_pattern: /^Blackthorne-DOS\/xmi\/[^/]+\.xmi/, song_count: 26, samples: 'resources/samples/Blackthorne/BTHORNE.AD' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Jagged_Alliance_(DOS)', composer: 'Steve Wener', song_pattern: /^originals\/[^/]+\.XMI/, song_count: 6, samples: 'resources/samples/Jagged Alliance/MADLAB.AD' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Theme_Hospital_(DOS)', composer: 'Russell Shaw, Adrian Moore', song_pattern: /^XMI\/[^/]+\.xmi/, song_count: 8, samples: 'resources/samples/Theme Hospital/SAMPLE.AD' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=The_Lost_Vikings_(DOS)', composer: ' Dave Bean, Alan Premselaar, Glenn Stafford, Rick Jackson', song_pattern: /^original\/(465|466|470|471|475|476|480|481|485|486|495|496|499|500|501|505|506|510|511)\.xmi/, song_count: 19, samples: 'resources/samples/Lost Vikings/VIKINGS.AD' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=WarCraft:_Orcs_%26_Humans_(DOS)', composer: 'Chris Palmer, Glenn Stafford, Gregory Alper, Rick Jackson', song_pattern: /^2[^/]+\.xmi/, song_count: 15, samples: 'resources/samples/Warcraft/WARCRAFT.AD' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=WarCraft_II:_Tides_of_Darkness_(DOS)', composer: 'Glenn Stafford', song_pattern: /^XMI\/1[^/]+\.xmi/, song_count: 17, samples: 'resources/samples/Warcraft 2/WARCRAFT.AD' },
	];
	const midGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Blood_(DOS)', composer: 'Daniel Bernstein, Mike Cody, Jay Wilson, Guy Whitmore', song_pattern: /^originals\/registered\/[^/]+\.mid/, song_count: 13, samples: 'resources/samples/Blood/GMTIMBRE.TMB' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Duke_Nukem_3D_(DOS)', composer: 'Robert Prince, Lee Jackson', song_pattern: /^(|Unreleased\/)[^/]+\.mid/, song_count: 31, samples: 'resources/samples/Duke Nukem 3D/D3DTIMBR.TMB' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Prince_of_Persia_(DOS)', composer: 'Francis Mechner', song_pattern: /^Originals\/MIDISND[12].DAT\/[^/]+\.mff/, song_count: 22, samples: 'resources/samples/Prince of Persia/PRESETS.DEF' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Rise_of_the_Triad:_Dark_War_(DOS)', composer: 'Robert Prince, Lee Jackson', song_pattern: /^[^/]+\.mid/, song_count: 34, samples: 'resources/samples/Rise of the Triad/ROTT.TMB' },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Shadow_Warrior_(DOS)', composer: 'Lee Jackson', song_pattern: /^[^/]+\.mid/, song_count: 5, samples: 'resources/samples/Shadow Warrior/SWTIMBR.TMB' },
	];
	const klmGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Wacky_Wheels_(DOS)', composer: 'Mark Klem', song_pattern: /^AdLib\/[^/]+\.klm/, song_count: 16 },
	];
	const hmpGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Theme_Park_(DOS)', composer: 'Russell Shaw', song_pattern: /^originals\/(extracted\/OPL\/[^/]+\.HMP|[^/]+\.BNK)/, song_count: 27+2, samples: ['VGMPF/PC/Theme Park/INST.BNK', 'VGMPF/PC/Theme Park/DRUM.BNK'], song_ignore: /[^/]+\.BNK/ },
	];
	const heradGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Dune_(DOS)', composer: 'Stéphane Picq', song_pattern: /^Originals\/Uncompressed\/(AdLib Gold\/[^/]+\.AGD|AdLib-SoundBlaster\/[^/]+\.SDB)/, song_count: 9+9 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=KGB_(DOS)', composer: 'Stéphane Picq', song_pattern: /^Originals\/Uncompressed\/AdLib-SoundBlaster\/[^/]+\.SDB/, song_count: 6 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=MegaRace_(DOS)', composer: 'Stéphane Picq', song_pattern: /^Originals\/Uncompressed\/[^/]+\.sdb/, song_count: 6 },
	];
	const adlCoktelVisionGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Gobliins_2:_The_Prince_Buffoon_(DOS)', composer: 'Charles Callet', song_pattern: /^[^/]+\.adl/, song_count: 12 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Goblins_Quest_3_(DOS)', composer: 'Charles Callet', song_pattern: /^[^/]+\.adl/, song_count: 8 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Lost_in_Time_(DOS)', composer: 'Charles Callet', song_pattern: /^originals\/[^/]+\.ADL/, song_count: 14 },
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Ween:_The_Prophecy_(DOS)', composer: 'Charles Callet', song_pattern: /^[^/]+\.adl/, song_count: 13 },
	];
	const modGames = [
		{ url: 'http://www.vgmpf.com/Wiki/index.php?title=Prehistorik_2_(DOS)', composer: 'Fabrice Paumier, Francis Fournier', song_pattern: /^[^/]+\.mod/, song_count: 12 },
	];
	const gameOptions = {
		'http://www.vgmpf.com/Wiki/index.php?title=Dune_II:_The_Building_of_a_Dynasty_(DOS)': { game: 'Dune II' },
		'http://www.vgmpf.com/Wiki/index.php?title=Final_DOOM_(DOS)#plutonia': { game: 'Final Doom - The Plutonia Experiment' },
		'http://www.vgmpf.com/Wiki/index.php?title=Final_DOOM_(DOS)#tnt': { game: 'Final Doom - TNT: Evilution' },
		'http://www.vgmpf.com/Wiki/index.php?title=Gobliins_2:_The_Prince_Buffoon_(DOS)': { game: 'Gobliins 2' },
		'http://www.vgmpf.com/Wiki/index.php?title=Goblins_Quest_3_(DOS)': { game: 'Goblins 3' },
		'http://www.vgmpf.com/Wiki/index.php?title=The_Legend_of_Kyrandia:_Book_One_(DOS)': { game: 'Legend of Kyrandia: Book One, The' },
		'http://www.vgmpf.com/Wiki/index.php?title=The_Legend_of_Kyrandia:_Book_Two_-_Hand_of_Fate_(DOS)': { game: 'Legend of Kyrandia: Book Two - The Hand of Fate, The' },
		'http://www.vgmpf.com/Wiki/index.php?title=The_Lost_Vikings_(DOS)': { game: 'Lost Vikings, The'},
		'http://www.vgmpf.com/Wiki/index.php?title=Ultima_VI:_The_False_Prophet_(DOS)': { game: 'Ultima VI' },
	};
	const games = [...imfGames, ...musGames, ...mGames, ...adlWestwoodGames, ...mdiGames, ...xmiGames, ...midGames, ...klmGames, ...hmpGames, ...heradGames, ...adlCoktelVisionGames, ...modGames];
	return (await sequential(games.map(game => () =>
		fetchGame(game, source, { ...gameOptions[game.url] })
	))).filter(game => game);
}

exports.fetchVgmpf = fetchVgmpf;
