'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

async function getResources(source) {
	const files = '../../resources';
	return fs.readdirSync(files).reduce((result, file) => {
		const resource = /^(.+)\.json$/.exec(file)?.[1];
		if (!resource) return result;
		console.log(` + ${resource}`);
		try {
			if (fs.lstatSync(path.join(files, resource)).isDirectory()) {
				console.log('copy', path.join(files, resource), '->', resource);
				fse.removeSync(resource);
				fse.copySync(path.join(files, resource), resource);
			}
		} catch(e) {}
		return [...result, ...JSON.parse(fs.readFileSync(path.join(files, file), 'utf-8'))];
	}, []);
}

exports.getResources = getResources;
