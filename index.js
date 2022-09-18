'use strict';

const fs = require('fs');
const process = require('process');
const getResources = require('./resources').getResources;
const fetchUnexotica = require('./unexotica').fetchUnexotica;
const fetchWogMods = require('./wog_mods').fetchWogMods;

const DATA = 'data';
const sources = {
	'resources': getResources,
	'World of Game MODs': fetchWogMods,
	'UnExoticA': fetchUnexotica,
};

(async () => {
	try {
		fs.mkdirSync(DATA);
	} catch {}

	const result = [];
	for (const source in sources) {
		try {
			fs.mkdirSync(`${DATA}/${source}`);
		} catch {}
		process.chdir(`${DATA}/${source}`);
		console.log(`\n   === ${source}\n`);
		result.unshift(await sources[source](source));
		process.chdir('../..');
	}
	const db = result.flat().sort((g1, g2) => g1.game <= g2.game ? -1 : 1);
	fs.writeFileSync(`${DATA}/index.json`, JSON.stringify(db, null, 2));
})();
