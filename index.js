'use strict';

const fs = require('fs');
const process = require('process');
const saveGalleryCache = require('./lib/gallery').saveGalleryCache;
const getResources = require('./sources/resources').getResources;
const fetchUnexotica = require('./sources/unexotica').fetchUnexotica;
const fetchVgmpf = require('./sources/vgmpf').fetchVgmpf;
const fetchWogMods = require('./sources/wog_mods').fetchWogMods;

const DATA = 'data';
const sources = {
	'resources': getResources,
	'VGMPF': fetchVgmpf,
	'World of Game MODs': fetchWogMods,
	'UnExoticA': fetchUnexotica,
};

const PREPEND_LINKS = {
	'Battle Arena Toshinden': [{ title: 'Battle Arena Toshinden', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Battle_Arena_Toshinden' }],
	'Mortal Kombat': [{ title: 'Mortal Kombat (CD)', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Mortal_Kombat_(CD)' }],
	'Warcraft: Orcs & Humans': [{ title: 'Warcraft: Orcs & Humans (CD)', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Warcraft:_Orcs_&_Humans_(CD)' }],
	'WarCraft II: Tides of Darkness': [{ title: 'Warcraft II: Tides of Darkness', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Warcraft_II:_Tides_of_Darkness' }],
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
	const db = result.flat().sort((g1, g2) => g1.game <= g2.game ? -1 : 1).map(game => ({
		...game,
		links: [...PREPEND_LINKS[game.game] ?? [], ...game.links ?? []],
	}));
	fs.writeFileSync(`${DATA}/index.json`, JSON.stringify(db, null, 2));
	const songs = db.map(({ songs }) => songs.length).reduce((sum, count) => sum+count, 0);
	console.log(`\n   === total\n\ngames: ${db.length}\nsongs: ${songs}`);
	saveGalleryCache();
})();
