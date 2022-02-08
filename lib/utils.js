'use strict';

Object.assign(exports, { sequential, takeUntil });

function takeUntil(a, e) {
	return a.slice(0, a.indexOf(e));
}

function sequential(promiseFactories) {
	return promiseFactories.reduce(async (res, pf) => [...await res, await pf()], []);
}
