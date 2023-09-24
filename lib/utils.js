'use strict';

Object.assign(exports, { groupBy, indexBy, sequential, takeUntil });

function takeUntil(a, e) {
	return a.slice(0, a.indexOf(e));
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
