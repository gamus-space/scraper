'use strict';

const xpath = require('xpath');

function takeUntil(a, e) {
	return a.slice(0, a.indexOf(e));
}

function sequenceUntil(node, sequencePath, terminatorPath) {
	if (!node) return node;
	const terminator = xpath.select1(terminatorPath, node);
	return xpath.select(sequencePath, node).filter(n => xpath.select1(terminatorPath, n) === terminator)
}

function sequential(promiseFactories) {
	return promiseFactories.reduce(async (res, pf) => [...await res, await pf()], []);
}

function groupBy(array, byFunc) {
	return array.reduce((result, item) => {
		const by = byFunc(item)
		return { ...result, [by]: [...result[by] ?? [], item] };
	}, {});
}

function indexBy(array, byFunc) {
	return array.reduce((result, item) => ({ ...result, [byFunc(item)]: item }), {});
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Object.assign(exports, { groupBy, indexBy, sequenceUntil, sequential, sleep, takeUntil });
