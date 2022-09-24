const fs = require('fs');
const { URL } = require('url');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const { sequential } = require('../lib/utils');

const PLATFORM_MAP = { 'DOS': 'PC' };

async function fetchGame({ url, composer, song_pattern, song_count, rate }, source) {
	const html = await (await fetch(url)).text();
	const doc = new dom().parseFromString(html);
	const infoTable = xpath.select1('//div[@id="mw-content-text"]/table[1]', doc);
	const game = xpath.select('normalize-space(./tr[1]/td)', infoTable);
	const metricsTable = xpath.select1('.//table', infoTable);
	const platformStr = xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Platform:"]/td[2])', metricsTable);
	const platform = PLATFORM_MAP[platformStr] || platformStr;
	const year = parseInt(xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Year:"]/td[2])', metricsTable)) || null;
	const developers = [xpath.select('normalize-space(./tr[normalize-space(./td[1]) = "Developer:"]/td[2])', metricsTable)];

	const releasesTitle = xpath.select1('//div[@id="mw-content-text"]//h2[span/@id="Releases"]', doc);
	const releasesTables = xpath.select('./following-sibling::*/descendant-or-self::table//table', releasesTitle);
	const publishers = [...new Set(releasesTables.map(table => xpath.select1('normalize-space(./tr[normalize-space(./td[1]) = "Publisher:"]/td[2])', table)))];

	const ripTitle = xpath.select1('//div[@id="mw-content-text"]//h3[span/@id="Game_Rip"]', doc);
	const downloadLink = xpath.select1('string(./following-sibling::*/descendant-or-self::table[1]//a[normalize-space(text()) = "Download"]/@href)', ripTitle);
	const downloadUrl = new URL(downloadLink, url);
	console.log(game, [downloadLink]);

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

	const fragment = rate != undefined ? `#${rate}` : '';
	const songs = files.map(file => ({
		song: file,
		song_link: `${source}/${gameDir}/${file}${fragment}`,
		size: fs.statSync(`${gameDir}/${file}`).size,
		composer,
		source_archive: downloadUrl.href,
	}));

	return { game, platform, developers, publishers, year, source, source_link: url, songs };
}

async function fetchVgmpf(source) {
	const games = [
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
	return (await sequential(games.map(game => () => fetchGame(game, source)))).filter(game => game);
}

exports.fetchVgmpf = fetchVgmpf;
