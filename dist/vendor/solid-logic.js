/*! vendored solid-logic@6.2.0 */
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {}, browser: true, version: "", versions: { node: "" },
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    cwd: () => "/", platform: "browser",
  };
}
import { Session } from '@uvdsl/solid-oidc-client-browser';
import * as t$b from '@uvdsl/solid-oidc-client-browser/core';
import * as f$3 from 'rdflib';
import { sym, graph, Namespace, serialize, namedNode as namedNode$1, NamedNode as NamedNode$1, term, st, Util, literal, parse } from 'rdflib';
import { Parser } from 'n3';

// src/util/debug.ts
function e$d(...e) {
	console.log(...e);
}
function t$a(...e) {
	console.warn(...e);
}
function n$a(...e) {
	console.error(...e);
}

// src/authSession/session.ts
var n$9 = class n {
	constructor() {
		this.map = /* @__PURE__ */ new Map();
	}
	shouldPreserveExistingRefreshToken(e, t) {
		return e === "refresh_token" && (t == null || t === "") && this.map.has(e);
	}
	async init() {
		return this;
	}
	async setItem(e, t) {
		this.shouldPreserveExistingRefreshToken(e, t) || this.map.set(e, t);
	}
	async getItem(e) {
		return this.map.has(e) ? this.map.get(e) : null;
	}
	async deleteItem(e) {
		this.map.delete(e);
	}
	async clear() {
		this.map.clear();
	}
	close() {}
}, r$9 = class r {
	constructor() {
		this.db = null, this.dbName = "soidc", this.storeName = "session", this.dbVersion = 1;
	}
	async shouldPreserveExistingRefreshToken(e, t) {
		if (e !== "refresh_token" || t != null && t !== "") return false;
		let n = await this.getItem(e);
		return n != null && n !== "";
	}
	async init() {
		if (this.db) return this;
		if (typeof indexedDB > "u") throw Error("IndexedDB is not available in this environment");
		return await new Promise((e, t) => {
			let n = indexedDB.open(this.dbName, this.dbVersion);
			n.onerror = () => t(n.error), n.onsuccess = () => {
				this.db = n.result, e();
			}, n.onupgradeneeded = () => {
				let e = n.result;
				e.objectStoreNames.contains(this.storeName) || e.createObjectStore(this.storeName);
			};
		}), this;
	}
	async setItem(e, t) {
		await this.init(), await this.shouldPreserveExistingRefreshToken(e, t) || await this.withStore("readwrite", (n) => n.put(t, e));
	}
	async getItem(e) {
		return await this.init(), this.withStore("readonly", (t) => t.get(e));
	}
	async deleteItem(e) {
		await this.init(), await this.withStore("readwrite", (t) => t.delete(e));
	}
	async clear() {
		await this.init(), await this.withStore("readwrite", (e) => e.clear());
	}
	close() {
		this.db &&= (this.db.close(), null);
	}
	withStore(e, t) {
		return new Promise((n, r) => {
			if (!this.db) {
				r(/* @__PURE__ */ Error("Session database not initialized"));
				return;
			}
			let i = this.db.transaction(this.storeName, e), a = t(i.objectStore(this.storeName)), o = null;
			i.onerror = () => r(i.error ?? a.error), i.onabort = () => r(i.error ?? a.error ?? /* @__PURE__ */ Error("IndexedDB transaction aborted")), i.oncomplete = () => n(o), a.onerror = () => r(a.error), a.onsuccess = () => {
				o = a.result ?? null;
			};
		});
	}
};
function i$8() {
	let e = t$b, n = e.SessionCore ?? e.default?.SessionCore ?? e.default;
	return typeof n == "function" ? n : null;
}
var a$8 = i$8();
function o$c() {
	if (typeof window < "u" && (() => {
		let e = window.location.hostname;
		return e === "localhost" || e === "127.0.0.1" || e.endsWith(".localhost");
	})()) return a$8 ? new a$8(void 0, { database: new r$9() }) : new Session();
	try {
		return new Session();
	} catch (t) {
		console.warn("solid-logic: falling back to non-worker auth session:", t);
		try {
			return a$8 ? new a$8(void 0, { database: new r$9() }) : new Session();
		} catch (t) {
			return console.warn("solid-logic: IndexedDB unavailable, using in-memory session database:", t), a$8 ? new a$8(void 0, { database: new n$9() }) : new Session();
		}
	}
}
var s$a = o$c();

// src/authSession/issuer.ts
async function e$c(e) {
	try {
		let t = new URL(e), n = new URL("/.well-known/openid-configuration", t.origin), r = await fetch(n.toString(), { credentials: "include" });
		if (!r.ok) return null;
		let i = await r.json();
		return typeof i?.issuer != "string" || !i.issuer ? null : i.issuer.replace(/\/$/, "");
	} catch {
		return null;
	}
}
async function t$9(t) {
	return await e$c(t) || t;
}

// src/authSession/events.ts
var e$b = class e {
	constructor() {
		this.listeners = /* @__PURE__ */ new Map();
	}
	on(e, t) {
		this.listeners.has(e) || this.listeners.set(e, /* @__PURE__ */ new Set()), this.listeners.get(e).add(t);
	}
	off(e, t) {
		this.listeners.get(e)?.delete(t);
	}
	emit(e, ...t) {
		this.listeners.get(e)?.forEach((e) => e(...t));
	}
};

// src/authSession/identityState.ts
function e$a(e, t) {
	return e.isActive === t.isActive ? t.webId === e.webId ? null : "sessionChange" : t.isActive ? "sessionChange" : "logout";
}
function t$8(e, t) {
	return e.webId === void 0 || !e.isActive ? false : t.webId !== e.webId || !t.isActive;
}
var n$8 = (e) => e.isActive === true || e.isActive === void 0 && !!e.webId, r$8 = 2e3, i$7 = /* @__PURE__ */ new WeakMap(), a$7 = /* @__PURE__ */ new WeakMap(), o$b = (e) => {
	if (typeof e != "object" || !e) return;
	let t = i$7.get(e);
	return t || (t = {
		session: e,
		raw: { isActive: false },
		cleared: false,
		cookieWebId: null,
		version: 0,
		attemptId: 0,
		subscribers: /* @__PURE__ */ new Set(),
		listenerAttached: false,
		watchingTokenUpdates: false
	}, t.raw = u$4(t), i$7.set(e, t)), t;
};
function s$9(e) {
	return typeof e != "object" || !e ? false : i$7.get(e)?.cleared === true;
}
function c$7(e) {
	return s$9(e) ? true : e?.isActive === false || e?.info?.isLoggedIn === false;
}
function l$4(e) {
	return !c$7(e) && n$8(e);
}
var u$4 = (e) => e.cleared ? { isActive: false } : {
	isActive: n$8(e.session),
	webId: e.session.webId
};
function d$3(e) {
	let t = o$b(e);
	return t ? l$4(e) ? e.webId === void 0 ? { source: "none" } : {
		webId: e.webId,
		source: "session"
	} : t.cookieWebId === null ? { source: "none" } : {
		webId: t.cookieWebId,
		source: "cookie"
	} : { source: "none" };
}
function f$2(e) {
	return s$9(e) ? {
		webId: void 0,
		isLoggedIn: false
	} : {
		webId: e.webId,
		isLoggedIn: n$8(e)
	};
}
function p$2(e) {
	let t = e?.restore;
	if (typeof t != "function" || typeof e != "object" || !e) return;
	let n = e, r = a$7.get(n);
	if (r) return r;
	let i = Promise.resolve().then(() => t.call(e)).finally(() => {
		a$7.delete(n);
	});
	return a$7.set(n, i), i;
}
var m$1 = (e, t) => {
	e.subscribers.forEach((e) => e.onTransition?.(t)), e.subscribers.forEach((e) => {
		t.forEach((t) => e.onEvent?.(t));
	});
};
function h$1(r) {
	r.cleared && n$8(r.session) && (r.cleared = false), l$4(r.session) && (r.cookieWebId = null);
	let i = u$4(r), a = e$a(r.raw, i), o = t$8(r.raw, i), s = a !== null || o;
	if (r.raw = i, !s) return;
	r.version += 1;
	let c = [];
	a && c.push(a), o && c.push("identityReplaced"), m$1(r, c);
}
function g$1(e) {
	if (e.cleared) return;
	let t = e.raw.isActive, n = e.raw.webId !== void 0;
	!t || !n ? (e.raw = u$4(e), t && (e.version += 1, m$1(e, ["logout"]))) : (e.cleared = true, e.raw = u$4(e), e.version += 1, m$1(e, ["logout", "identityReplaced"]));
}
function _$1(e, t) {
	if (e.attempt) return e.attempt;
	let r = {
		id: ++e.attemptId,
		version: e.version,
		raw: {
			isActive: n$8(e.session),
			webId: e.session.webId
		},
		promise: Promise.resolve().then(t).finally(() => {
			e.attempt === r && (e.attempt = void 0);
		})
	};
	return e.attempt = r, r;
}
async function v$2(e) {
	let t = y$1(e);
	if (typeof t != "function") {
		h$1(e);
		return;
	}
	let i = t, a = _$1(e, () => i()), o = () => a.id !== e.attemptId || e.version !== a.version, s = () => n$8(e.session) === a.raw.isActive && e.session.webId === a.raw.webId, c, l = false, u = a.promise.then((e) => {
		c = e, l = true;
	}, () => {
		l = true;
	}), d = () => {
		o() || (c === "cleared" ? s() && g$1(e) : h$1(e));
	}, f, p = new Promise((e) => {
		f = setTimeout(e, r$8);
	});
	try {
		await Promise.race([u, p]);
	} finally {
		f !== void 0 && clearTimeout(f);
	}
	l ? d() : (h$1(e), u.then(d));
}
function y$1(e) {
	let t;
	for (let n of e.subscribers) n.resync && (t = n.resync);
	return t;
}
function b$2(e) {
	let t = e.session, n = t.setTokenDetails;
	typeof n != "function" || e.watchingTokenUpdates || (e.watchingTokenUpdates = true, t.setTokenDetails = (...r) => {
		let i = u$4(e), a = () => {
			let t = u$4(e);
			return t.webId !== i.webId || t.isActive !== i.isActive;
		}, o;
		try {
			o = n.apply(t, r);
		} catch (t) {
			throw a() && h$1(e), t;
		}
		return o && typeof o.then == "function" ? o.then((t) => (a() && h$1(e), t), (t) => {
			throw a() && h$1(e), t;
		}) : (a() && h$1(e), o);
	});
}
function x$1(e, t = {}) {
	let n = o$b(e);
	if (!n) return {
		reportCookieIdentity: () => void 0,
		unsubscribe: () => void 0
	};
	let r = { ...t };
	n.subscribers.add(r), n.listenerAttached || (n.listenerAttached = true, typeof e.addEventListener == "function" && e.addEventListener("sessionStateChange", () => h$1(n)), b$2(n));
	let i = typeof document > "u" ? void 0 : document;
	if (n.subscribers.size === 1 && i && typeof i.addEventListener == "function") {
		let e = () => {
			i.visibilityState === "visible" && (v$2(n), n.subscribers.forEach((e) => {
				e.onRefocus?.();
			}));
		};
		i.addEventListener("visibilitychange", e), n.detachDocument = () => i.removeEventListener?.("visibilitychange", e);
	}
	let a = false;
	return {
		reportCookieIdentity: (e) => {
			a || S$1(n, e);
		},
		unsubscribe: () => {
			a || (a = true, n.subscribers.delete(r), n.subscribers.size === 0 && (n.detachDocument?.(), n.detachDocument = void 0));
		}
	};
}
function S$1(e, t) {
	if (e.cookieWebId === t || l$4(e.session)) return;
	let n = e.cookieWebId !== null;
	e.cookieWebId = t;
	let r = ["sessionChange"];
	n && r.push("identityReplaced"), m$1(e, r);
}
function C$1(e, t = () => {
	typeof window < "u" && window.location.reload();
}) {
	e && typeof e.on == "function" && e.on("identityReplaced", t);
}

// src/authSession/authSession.ts
var o$a = s$a, s$8 = typeof o$a.login == "function" ? o$a.login.bind(s$a) : void 0;
s$8 && (o$a.login = async (e, n) => {
	if (e && typeof e == "object" && !Array.isArray(e)) {
		let n = e.oidcIssuer ?? e.idp ?? e.issuer, r = e.redirectUrl ?? e.redirect_uri ?? e.redirectUri;
		if (typeof n == "string" && typeof r == "string") return s$8(await t$9(n), r);
	}
	return s$8(typeof e == "string" ? await t$9(e) : e, n);
});
var c$6 = new e$b();
x$1(s$a, {
	onEvent: (e) => c$6.emit(e),
	resync: () => {
		let t = p$2(s$a);
		if (t) return t.then(() => "changed", (e) => {
			let t = e instanceof Error ? e.message : String(e);
			return /no session to restore/i.test(t) ? "cleared" : "changed";
		});
	}
});
var l$3 = Object.assign(s$a, { events: c$6 });
Object.defineProperty(l$3, "info", {
	enumerable: true,
	configurable: true,
	get() {
		return f$2(s$a);
	},
	set(e) {}
});

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getAugmentedNamespace(n) {
  if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			var isInstance = false;
      try {
        isInstance = this instanceof a;
      } catch {}
			if (isInstance) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

/**
 * Provides a way to access commonly used namespaces
 *
 * Usage:
 *
 *   ```
 *   const $rdf = require('rdflib'); //or any other RDF/JS-compatible library
 *   const ns = require('solid-namespace')($rdf);
 *   const store = $rdf.graph();
 *
 *   let me = ...;
 *   let name = store.any(me, ns.vcard(‘fn’)) || store.any(me, ns.foaf(‘name’));
 *   ```
 * @module vocab
 */

var solidNamespace;
var hasRequiredSolidNamespace;

function requireSolidNamespace () {
	if (hasRequiredSolidNamespace) return solidNamespace;
	hasRequiredSolidNamespace = 1;
	const aliases = {
	  acl: 'http://www.w3.org/ns/auth/acl#',
	  arg: 'http://www.w3.org/ns/pim/arg#',
	  as: 'https://www.w3.org/ns/activitystreams#',
	  bookmark: 'http://www.w3.org/2002/01/bookmark#',
	  cal: 'http://www.w3.org/2002/12/cal/ical#',
	  cco: 'http://www.ontologyrepository.com/CommonCoreOntologies/',
	  cert: 'http://www.w3.org/ns/auth/cert#',
	  contact: 'http://www.w3.org/2000/10/swap/pim/contact#',
	  dc: 'http://purl.org/dc/elements/1.1/',
	  dct: 'http://purl.org/dc/terms/',
	  doap: 'http://usefulinc.com/ns/doap#',
	  foaf: 'http://xmlns.com/foaf/0.1/',
	  geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
	  gpx: 'http://www.w3.org/ns/pim/gpx#',
	  gr: 'http://purl.org/goodrelations/v1#',
	  http: 'http://www.w3.org/2007/ont/http#',
	  httph: 'http://www.w3.org/2007/ont/httph#',
	  icalTZ: 'http://www.w3.org/2002/12/cal/icaltzd#', // Beware: not cal:
	  ldp: 'http://www.w3.org/ns/ldp#',
	  link: 'http://www.w3.org/2007/ont/link#',
	  log: 'http://www.w3.org/2000/10/swap/log#',
	  meeting: 'http://www.w3.org/ns/pim/meeting#',
	  mo: 'http://purl.org/ontology/mo/',
	  org: 'http://www.w3.org/ns/org#',
	  owl: 'http://www.w3.org/2002/07/owl#',
	  pad: 'http://www.w3.org/ns/pim/pad#',
	  patch: 'http://www.w3.org/ns/pim/patch#',
	  prov: 'http://www.w3.org/ns/prov#',
	  pto: 'http://www.productontology.org/id/',
	  qu: 'http://www.w3.org/2000/10/swap/pim/qif#',
	  trip: 'http://www.w3.org/ns/pim/trip#',
	  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
	  rss: 'http://purl.org/rss/1.0/',
	  sched: 'http://www.w3.org/ns/pim/schedule#',
	  schema: 'http://schema.org/', // @@ beware confusion with documents no 303
	  sioc: 'http://rdfs.org/sioc/ns#',
	  skos: 'http://www.w3.org/2004/02/skos/core#',
	  solid: 'http://www.w3.org/ns/solid/terms#',
	  space: 'http://www.w3.org/ns/pim/space#',
	  stat: 'http://www.w3.org/ns/posix/stat#',
	  tab: 'http://www.w3.org/2007/ont/link#',
	  tabont: 'http://www.w3.org/2007/ont/link#',
	  ui: 'http://www.w3.org/ns/ui#',
	  vann: 'http://purl.org/vocab/vann/',
	  vcard: 'http://www.w3.org/2006/vcard/ns#',
	  wf: 'http://www.w3.org/2005/01/wf/flow#',
	  xsd: 'http://www.w3.org/2001/XMLSchema#',
	};

	/**
	 * @param [rdflib] {RDF} Optional RDF Library (such as rdflib.js or rdf-ext) to inject
	 */
	function vocab (rdf = { namedNode: u => u }) {
	  const namespaces = {};
	  for (const alias in aliases) {
	    const expansion = aliases[alias];
	    namespaces[alias] = function (localName = '') {
	      return rdf.namedNode(expansion + localName)
	    };
	  }
	  return namespaces
	}
	solidNamespace = vocab;
	return solidNamespace;
}

var solidNamespaceExports = requireSolidNamespace();
var t$7 = /*@__PURE__*/getDefaultExportFromCjs(solidNamespaceExports);

// src/util/ns.ts
var n$7 = t$7(f$3);

// src/acl/accessControlSubjects.ts
var r$7 = {
	agentClass: [
		n$7.foaf("Agent"),
		n$7.acl("AuthenticatedAgent"),
		n$7.rdf("Resource"),
		n$7.owl("Thing")
	],
	agent: [
		n$7.vcard("WebID"),
		n$7.vcard("Individual"),
		n$7.foaf("Person"),
		n$7.foaf("Agent")
	],
	agentGroup: [n$7.vcard("Group")],
	origin: [n$7.solid("AppProvider"), n$7.solid("AppProviderClass")]
};
function i$6(e) {
	return Object.keys(e).length > 0;
}
function a$6(e) {
	return e.startsWith("http://") || e.startsWith("https://");
}
function o$9(e) {
	try {
		let t = new URL(e);
		return (t.protocol === "http:" || t.protocol === "https:") && !!t.hostname && t.pathname === "/" && !t.search && !t.hash && !t.username && !t.password;
	} catch {
		return false;
	}
}
function s$7(e) {
	try {
		let t = new URL(e);
		if ((t.protocol === "http:" || t.protocol === "https:") && t.hostname && t.pathname === "/" && !t.search && !t.hash && !t.username && !t.password) return `${t.protocol}//${t.host}`;
	} catch {}
	return e;
}
async function c$5(c, l) {
	let u = sym(l), d = c.findTypeURIs(u);
	if (o$9(l)) return {
		kind: "origin",
		subjectValue: s$7(l)
	};
	if (!i$6(d) && a$6(l)) {
		try {
			await c.fetcher.load(u.doc());
		} catch (e) {
			n$a(`Failed to load access target ${l}`, e);
		}
		d = c.findTypeURIs(u);
	}
	if (r$7.origin.some((e) => e.uri in d)) return {
		kind: "origin",
		subjectValue: l
	};
	if (r$7.agent.some((e) => e.uri in d)) return {
		kind: "agent",
		subjectValue: c.any(u, n$7.foaf("preferredURI"))?.value ?? l
	};
	if (r$7.agentGroup.some((e) => e.uri in d)) return {
		kind: "agentGroup",
		subjectValue: l
	};
	if (r$7.agentClass.some((e) => u.sameTerm(e))) return {
		kind: "agentClass",
		subjectValue: l
	};
}

class BlankNode {
  constructor (id) {
    this.value = id;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
}

BlankNode.prototype.termType = 'BlankNode';

class DefaultGraph {
  equals (other) {
    return !!other && other.termType === this.termType
  }
}

DefaultGraph.prototype.termType = 'DefaultGraph';
DefaultGraph.prototype.value = '';

function fromTerm (factory, original) {
  if (!original) {
    return null
  }

  if (original.termType === 'BlankNode') {
    return factory.blankNode(original.value)
  }

  if (original.termType === 'DefaultGraph') {
    return factory.defaultGraph()
  }

  if (original.termType === 'Literal') {
    return factory.literal(original.value, original.language || factory.namedNode(original.datatype.value))
  }

  if (original.termType === 'NamedNode') {
    return factory.namedNode(original.value)
  }

  if (original.termType === 'Quad') {
    const subject = factory.fromTerm(original.subject);
    const predicate = factory.fromTerm(original.predicate);
    const object = factory.fromTerm(original.object);
    const graph = factory.fromTerm(original.graph);

    return factory.quad(subject, predicate, object, graph)
  }

  if (original.termType === 'Variable') {
    return factory.variable(original.value)
  }

  throw new Error(`unknown termType ${original.termType}`)
}

class Literal {
  constructor (value, language, datatype, direction = '') {
    this.value = value;
    this.language = language;
    this.datatype = datatype;
    this.direction = direction;
  }

  equals (other) {
    return !!other &&
      other.termType === this.termType &&
      other.value === this.value &&
      other.language === this.language &&
      other.datatype.equals(this.datatype) &&
      (other.direction || '') === this.direction
  }
}

Literal.prototype.termType = 'Literal';

class NamedNode {
  constructor (iri) {
    this.value = iri;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
}

NamedNode.prototype.termType = 'NamedNode';

class Quad {
  constructor (subject, predicate, object, graph) {
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.graph = graph;
  }

  equals (other) {
    // `|| !other.termType` is for backwards-compatibility with old factories without RDF* support.
    return !!other &&
      (other.termType === 'Quad' || !other.termType) &&
      other.subject.equals(this.subject) &&
      other.predicate.equals(this.predicate) &&
      other.object.equals(this.object) &&
      other.graph.equals(this.graph)
  }
}

Quad.prototype.termType = 'Quad';
Quad.prototype.value = '';

class Variable {
  constructor (name) {
    this.value = name;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
}

Variable.prototype.termType = 'Variable';

const dirLangStringDatatype = new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString');
const langStringDatatype = new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#langString');
const stringDatatype = new NamedNode('http://www.w3.org/2001/XMLSchema#string');

class DataFactory {
  constructor () {
    this.init();
  }

  init () {
    this._data = {
      blankNodeCounter: 0,
      defaultGraph: new DefaultGraph()
    };
  }

  namedNode (value) {
    return new NamedNode(value)
  }

  blankNode (value) {
    value = value || ('b' + (++this._data.blankNodeCounter));

    return new BlankNode(value)
  }

  literal (value, languageOrDatatype) {
    if (typeof languageOrDatatype === 'string') {
      return new Literal(value, languageOrDatatype, langStringDatatype)
    } else if (typeof languageOrDatatype?.language === 'string') {
      return new Literal(
        value,
        languageOrDatatype.language,
        languageOrDatatype.direction ? dirLangStringDatatype : langStringDatatype,
        languageOrDatatype.direction)
    } else {
      return new Literal(value, '', languageOrDatatype || stringDatatype)
    }
  }

  variable (value) {
    return new Variable(value)
  }

  defaultGraph () {
    return this._data.defaultGraph
  }

  quad (subject, predicate, object, graph = this.defaultGraph()) {
    return new Quad(subject, predicate, object, graph)
  }

  fromTerm (original) {
    return fromTerm(this, original)
  }

  fromQuad (original) {
    return fromTerm(this, original)
  }
}

DataFactory.exports = [
  'blankNode',
  'defaultGraph',
  'fromQuad',
  'fromTerm',
  'literal',
  'namedNode',
  'quad',
  'variable'
];

const factory = new DataFactory();

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const ACL = 'http://www.w3.org/ns/auth/acl#';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const Public = { type: 'agentClass', iri: FOAF + 'Agent' };
const Authenticated = { type: 'agentClass', iri: ACL + 'AuthenticatedAgent' };
const ACCESS_MODES = ['Read', 'Write', 'Append', 'Control'];
function modeIRI(mode) {
    return ACL + mode;
}
function modeFromIRI(iri) {
    if (!iri.startsWith(ACL))
        return undefined;
    const name = iri.slice(ACL.length);
    return ACCESS_MODES.includes(name) ? name : undefined;
}
function namedNode(value) {
    return factory.namedNode(value);
}
function quad(subject, predicate, object) {
    return factory.quad(subject, predicate, object);
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
class WACError extends Error {
    constructor(message, options) {
        super(message);
        this.name = 'WACError';
        this.iri = options?.iri;
        this.cause = options?.cause;
    }
}
/** no effective ACL resource could be determined for the resource */
class ACLNotDeterminedError extends WACError {
    constructor(message, options) {
        super(message, options);
        this.name = 'ACLNotDeterminedError';
    }
}
/** a candidate ACL resource answered 403; the search must stop */
class ACLAccessDeniedError extends WACError {
    constructor(message, options) {
        super(message, options);
        this.status = 403;
        this.name = 'ACLAccessDeniedError';
        this.iri = options.iri;
    }
}
class ACLFetchError extends WACError {
    constructor(message, options) {
        super(message, options);
        this.name = 'ACLFetchError';
        this.iri = options.iri;
        this.status = options.status;
    }
}
class PatchApplyError extends WACError {
    constructor(message, options) {
        super(message, options);
        this.name = 'PatchApplyError';
        this.iri = options.iri;
        this.status = options.status;
    }
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const ENTRY_PATTERN = /<([^>]*)>((?:\s*;\s*[\w*-]+\s*=\s*(?:"[^"]*"|[^,;]+))*)/g;
const PARAM_PATTERN = /;\s*([\w*-]+)\s*=\s*(?:"([^"]*)"|([^,;\s]+))/g;
function parseLinkHeader(headerValue) {
    const entries = [];
    for (const match of headerValue.matchAll(ENTRY_PATTERN)) {
        const params = {};
        for (const param of match[2].matchAll(PARAM_PATTERN)) {
            const key = param[1].toLowerCase();
            // first occurrence of a parameter wins, per RFC 8288
            if (!(key in params))
                params[key] = param[2] ?? param[3] ?? '';
        }
        entries.push({ target: match[1], params });
    }
    return entries;
}
/** absolute targets of entries carrying the given link relation */
function linkTargets(headerValue, rel, baseIRI) {
    if (!headerValue)
        return [];
    const targets = [];
    const wanted = rel.toLowerCase();
    for (const entry of parseLinkHeader(headerValue)) {
        const rels = (entry.params.rel ?? '').toLowerCase().split(/\s+/);
        if (rels.includes(wanted))
            targets.push(new URL(entry.target, baseIRI).href);
    }
    return targets;
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
function subjectKey(term) {
    return term.termType + ':' + term.value;
}
function indexBySubject(dataset) {
    const index = new Map();
    for (const q of dataset) {
        const key = subjectKey(q.subject);
        let entry = index.get(key);
        if (!entry) {
            entry = { term: q.subject, properties: new Map() };
            index.set(key, entry);
        }
        let objects = entry.properties.get(q.predicate.value);
        if (!objects) {
            objects = [];
            entry.properties.set(q.predicate.value, objects);
        }
        objects.push(q.object);
    }
    return index;
}
function values(entry, predicate) {
    return (entry?.properties.get(predicate) ?? []).map(term => term.value);
}
function parseCondition(index, term) {
    const properties = {};
    const entry = index.get(subjectKey(term));
    if (entry) {
        for (const [predicate, objects] of entry.properties) {
            properties[predicate] = objects.map(o => o.value);
        }
    }
    return { id: term.value, blankNode: term.termType === 'BlankNode', properties };
}
function authorizationsFromDataset(dataset, matcher) {
    const index = indexBySubject(dataset);
    const authorizations = [];
    for (const entry of index.values()) {
        if (!values(entry, RDF_TYPE).includes(ACL + 'Authorization'))
            continue;
        const matched = Object.entries(matcher).every(([key, value]) => value === undefined || values(entry, ACL + key).includes(value));
        if (!matched)
            continue;
        const modes = [];
        for (const iri of values(entry, ACL + 'mode')) {
            const mode = modeFromIRI(iri);
            if (mode && !modes.includes(mode))
                modes.push(mode);
        }
        authorizations.push({
            id: entry.term.value,
            blankNode: entry.term.termType === 'BlankNode',
            accessTo: values(entry, ACL + 'accessTo'),
            default: values(entry, ACL + 'default'),
            agent: values(entry, ACL + 'agent'),
            agentClass: values(entry, ACL + 'agentClass'),
            agentGroup: values(entry, ACL + 'agentGroup'),
            mode: modes,
            origin: values(entry, ACL + 'origin'),
            condition: (entry.properties.get(ACL + 'condition') ?? []).map(term => parseCondition(index, term)),
        });
    }
    return authorizations;
}
function buildACLContext(input) {
    const inherited = input.defaultACLResource !== input.effectiveACLResource;
    if (inherited && input.effectiveContainer === undefined) {
        throw new WACError('effectiveContainer is required when the effective ACL resource is inherited', {
            iri: input.resource,
        });
    }
    const matcher = inherited
        ? { default: input.effectiveContainer }
        : { accessTo: input.resource };
    return {
        resource: input.resource,
        defaultACLResource: input.defaultACLResource,
        effectiveACLResource: input.effectiveACLResource,
        effectiveContainer: input.effectiveContainer,
        inherited,
        conditions: input.conditions ?? [],
        authorizations: authorizationsFromDataset(input.dataset, matcher),
        dataset: input.dataset,
    };
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/** media types parseTurtle reads */
const TURTLE_MEDIA_TYPES = [
    'text/turtle',
    'application/trig',
    'application/n-triples',
    'application/n-quads',
    'text/n3',
];
function isSupported(mediaType) {
    return TURTLE_MEDIA_TYPES.includes(mediaType);
}
/** The default GraphParser. Reads the Turtle family; pass your own for anything else. */
const parseTurtle = (input, { baseIRI, contentType }) => {
    const mediaType = contentType.split(';')[0].trim().toLowerCase();
    if (!isSupported(mediaType)) {
        throw new WACError(`The built-in parser reads ${TURTLE_MEDIA_TYPES.join(', ')}, not ${mediaType}; ` +
            'pass a parse function that does', { iri: baseIRI });
    }
    try {
        return new Parser({ baseIRI, format: mediaType }).parse(input);
    }
    catch (cause) {
        throw new WACError(`Failed to parse ${mediaType} from ${baseIRI}`, { iri: baseIRI, cause });
    }
};

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const NOT_DETERMINED = 'Effective ACL resource not determined. https://solidproject.org/TR/wac#effective-acl-resource-algorithm';
// WAC names no discovery method; RFC 9110 lets servers omit computed headers on HEAD, so GET is the fallback.
async function advertisedACLResource(candidate, fetch) {
    let last = { targets: [], method: 'HEAD', status: 0 };
    for (const method of ['HEAD', 'GET']) {
        let response;
        try {
            response = await fetch(candidate, { method });
        }
        catch (cause) {
            throw new ACLFetchError(`Failed to ${method} ${candidate}`, { iri: candidate, cause });
        }
        const targets = linkTargets(response.headers.get('Link'), 'acl', candidate);
        // the representation is never wanted
        if (method === 'GET')
            response.body?.cancel().catch(() => { });
        last = { targets, method, status: response.status };
        if (targets.length)
            return last;
    }
    return last;
}
/** Determine parent container based on RFC 3986's notion of `/`s representing hierarchical syntactic convention. Other methods, e.g., `rel="up"`, are considered. https://github.com/dokieli/web-access-control/issues/1 */
function parentContainer(url) {
    const parsed = new URL(url);
    if (parsed.pathname === '/' || parsed.pathname === '')
        return undefined;
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    return parsed.origin + path.slice(0, path.lastIndexOf('/') + 1);
}
/** https://solidproject.org/TR/wac#effective-acl-resource-algorithm */
async function findEffectiveACL(resourceURL, options) {
    const { fetch = globalThis.fetch, parse = parseTurtle, accept = 'text/turtle' } = options;
    const resource = new URL(resourceURL).href;
    let candidate = resource;
    let hint = options.aclResource === undefined ? undefined : new URL(options.aclResource, resource).href;
    let defaultACLResource;
    let effectiveContainer;
    for (;;) {
        let aclResource;
        if (hint === undefined) {
            const advertised = await advertisedACLResource(candidate, fetch);
            if (advertised.targets.length === 0) {
                throw new ACLNotDeterminedError(`No Link rel="acl" on ${candidate}; neither HEAD nor GET advertised one ` +
                    `(${advertised.method} answered ${advertised.status}). ${NOT_DETERMINED}`, { iri: candidate });
            }
            aclResource = advertised.targets[0];
        }
        else {
            aclResource = hint;
            hint = undefined;
        }
        defaultACLResource = defaultACLResource ?? aclResource;
        let response;
        try {
            response = await fetch(aclResource, { headers: { Accept: accept } });
        }
        catch (cause) {
            throw new ACLFetchError(`Failed to fetch ${aclResource}`, { iri: aclResource, cause });
        }
        if (response.status === 404) {
            const container = parentContainer(candidate);
            if (container === undefined) {
                throw new ACLNotDeterminedError(NOT_DETERMINED, { iri: resource });
            }
            effectiveContainer = container;
            candidate = container;
            continue;
        }
        if (response.status === 403) {
            throw new ACLAccessDeniedError(`Access to candidate ACL resource ${aclResource} is forbidden. Stopping effective ACL resource search.`, { iri: aclResource });
        }
        if (!response.ok) {
            throw new ACLFetchError(`Failed to fetch ${aclResource}: ${response.status}`, {
                iri: aclResource,
                status: response.status,
            });
        }
        const contentType = response.headers.get('Content-Type') ?? accept;
        const text = await response.text();
        const dataset = await parse(text, { baseIRI: aclResource, contentType });
        // https://solid.github.io/web-access-control-spec/#client-link-condition
        const conditions = linkTargets(response.headers.get('Link'), ACL + 'condition', aclResource);
        return buildACLContext({
            resource,
            defaultACLResource,
            effectiveACLResource: aclResource,
            effectiveContainer,
            conditions,
            dataset,
        });
    }
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const SUBJECT_TYPES = ['agent', 'agentClass', 'agentGroup', 'origin'];
/** what an ACL resource advertising a client link condition gets by default */
const ANY_CLIENT = { type: 'ClientCondition', property: 'clientClass', iri: FOAF + 'Agent' };
function defaultNewId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    return 'authorization-' + (uuid ?? Math.random().toString(36).slice(2, 10));
}
function collectTakenIds(ctx) {
    const taken = new Set();
    for (const q of ctx.dataset) {
        if (q.subject.termType === 'NamedNode')
            taken.add(q.subject.value);
    }
    return taken;
}
function freshIRI(target, taken, newId) {
    let iri = target + '#' + newId();
    let attempt = 0;
    while (taken.has(iri)) {
        attempt += 1;
        iri = target + '#' + newId() + '-' + attempt;
    }
    taken.add(iri);
    return iri;
}
function isOrigin(iri) {
    try {
        return new URL(iri).origin === iri;
    }
    catch {
        return false;
    }
}
function subjectCount(authorization) {
    return SUBJECT_TYPES.reduce((count, type) => count + authorization[type].length, 0);
}
// Quads about a subject IRI. Blank node objects are excluded, a patch cannot match them.
function datasetQuads(ctx, subjectIRI, predicate) {
    return ctx.dataset.filter(q => q.subject.termType === 'NamedNode' &&
        q.subject.value === subjectIRI &&
        (predicate === undefined || q.predicate.value === predicate) &&
        q.object.termType !== 'BlankNode');
}
function ruleQuads(spec) {
    const rule = namedNode(spec.id);
    const quads = [quad(rule, namedNode(RDF_TYPE), namedNode(ACL + 'Authorization'))];
    quads.push(quad(rule, namedNode(ACL + 'accessTo'), namedNode(spec.resource)));
    for (const mode of spec.modes)
        quads.push(quad(rule, namedNode(ACL + 'mode'), namedNode(modeIRI(mode))));
    for (const iri of spec.agent)
        quads.push(quad(rule, namedNode(ACL + 'agent'), namedNode(iri)));
    for (const iri of spec.agentClass)
        quads.push(quad(rule, namedNode(ACL + 'agentClass'), namedNode(iri)));
    for (const iri of spec.agentGroup)
        quads.push(quad(rule, namedNode(ACL + 'agentGroup'), namedNode(iri)));
    for (const iri of spec.origin)
        quads.push(quad(rule, namedNode(ACL + 'origin'), namedNode(iri)));
    return quads;
}
function conditionQuads(ruleId, conditionId, spec) {
    const condition = namedNode(conditionId);
    const quads = [
        quad(namedNode(ruleId), namedNode(ACL + 'condition'), condition),
        quad(condition, namedNode(RDF_TYPE), namedNode(ACL + spec.type)),
    ];
    if (spec.property && spec.iri) {
        quads.push(quad(condition, namedNode(ACL + spec.property), namedNode(spec.iri)));
    }
    return quads;
}
// The caller's conditions, or the any-client default when the ACL resource advertises one.
function conditionsForNewRule(ctx, requested) {
    if (requested)
        return requested;
    return ctx.conditions.length ? [ANY_CLIENT] : [];
}
function clonedConditionQuads(ruleId, conditionId, source) {
    const condition = namedNode(conditionId);
    const quads = [quad(namedNode(ruleId), namedNode(ACL + 'condition'), condition)];
    for (const [predicate, objects] of Object.entries(source.properties)) {
        for (const value of objects) {
            quads.push(quad(condition, namedNode(predicate), namedNode(value)));
        }
    }
    return quads;
}
function freshRuleQuads(input) {
    const { ctx, taken, newId, subject, modes, origin } = input;
    const id = freshIRI(ctx.defaultACLResource, taken, newId);
    const quads = ruleQuads({
        id,
        resource: ctx.resource,
        modes,
        agent: subject.type === 'agent' ? [subject.iri] : [],
        agentClass: subject.type === 'agentClass' ? [subject.iri] : [],
        agentGroup: subject.type === 'agentGroup' ? [subject.iri] : [],
        origin: subject.type === 'origin' && !origin.includes(subject.iri) ? [subject.iri, ...origin] : origin,
    });
    for (const spec of conditionsForNewRule(ctx, input.conditions)) {
        quads.push(...conditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), spec));
    }
    return quads;
}
function cloneRuleQuads(input) {
    const { ctx, taken, newId, authorization, modes, without } = input;
    const id = freshIRI(ctx.defaultACLResource, taken, newId);
    const subjects = {
        agent: [...authorization.agent],
        agentClass: [...authorization.agentClass],
        agentGroup: [...authorization.agentGroup],
        origin: [...authorization.origin],
    };
    if (without) {
        subjects[without.type] = subjects[without.type].filter(iri => iri !== without.iri);
    }
    const quads = ruleQuads({
        id,
        resource: ctx.resource,
        modes: modes ?? authorization.mode,
        ...subjects,
    });
    if (input.conditions) {
        for (const spec of input.conditions) {
            quads.push(...conditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), spec));
        }
    }
    else {
        // always carried over: a copy that sheds a condition is broader than its source
        for (const condition of authorization.condition) {
            quads.push(...clonedConditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), condition));
        }
    }
    return quads;
}
function planGrant(ctx, subject, modes, options) {
    if (!modes.length) {
        throw new WACError('planGrant requires at least one mode; use planRevoke to remove access', { iri: ctx.resource });
    }
    // a value with a path or trailing slash never matches an Origin header
    if (subject.type === 'origin' && !isOrigin(subject.iri)) {
        throw new WACError(`${subject.iri} is not an origin, expected scheme://host[:port]`, { iri: ctx.resource });
    }
    const newId = defaultNewId;
    const origin = [];
    const conditions = options?.conditions;
    const target = ctx.defaultACLResource;
    const taken = collectTakenIds(ctx);
    const deletes = [];
    const inserts = [];
    if (!ctx.inherited) {
        let updatedInPlace = false;
        for (const authorization of ctx.authorizations) {
            if (!authorization[subject.type].includes(subject.iri))
                continue;
            // blank node rules cannot be patched
            if (authorization.blankNode)
                continue;
            if (subjectCount(authorization) === 1) {
                // rewrite acl:mode, and acl:condition only when the caller asked
                deletes.push(...datasetQuads(ctx, authorization.id, ACL + 'mode'));
                for (const mode of modes) {
                    inserts.push(quad(namedNode(authorization.id), namedNode(ACL + 'mode'), namedNode(modeIRI(mode))));
                }
                updatedInPlace = true;
            }
            else {
                // the shared rule keeps its other subjects; this one gets its own
                deletes.push(quad(namedNode(authorization.id), namedNode(ACL + subject.type), namedNode(subject.iri)));
            }
        }
        if (!updatedInPlace) {
            inserts.push(...freshRuleQuads({ ctx, taken, newId, subject, modes, origin, conditions }));
        }
        return { target, deletes, inserts };
    }
    // inherited: clone the container authorizations, applying the change on the way
    // XXX: clones are not merged, so two container rules with the same properties stay duplicate rules
    let updatedInClone = false;
    for (const authorization of ctx.authorizations) {
        const isMember = authorization[subject.type].includes(subject.iri);
        if (isMember && subjectCount(authorization) === 1) {
            inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization, modes, conditions }));
            updatedInClone = true;
        }
        else if (isMember) {
            inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization, without: subject }));
        }
        else {
            inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization }));
        }
    }
    if (!updatedInClone) {
        inserts.push(...freshRuleQuads({ ctx, taken, newId, subject, modes, origin, conditions }));
    }
    return { target, deletes: [], inserts };
}
function planRevoke(ctx, subject, options) {
    const newId = defaultNewId;
    const target = ctx.defaultACLResource;
    if (!ctx.inherited) {
        const deletes = [];
        for (const authorization of ctx.authorizations) {
            if (!authorization[subject.type].includes(subject.iri))
                continue;
            if (authorization.blankNode)
                continue;
            if (subjectCount(authorization) === 1) {
                deletes.push(...datasetQuads(ctx, authorization.id));
                for (const condition of authorization.condition) {
                    // blank node conditions cannot be deleted; the dangling node is inert
                    if (!condition.blankNode)
                        deletes.push(...datasetQuads(ctx, condition.id));
                }
            }
            else {
                deletes.push(quad(namedNode(authorization.id), namedNode(ACL + subject.type), namedNode(subject.iri)));
            }
        }
        if (!deletes.length) {
            throw new WACError(`No authorization found granting access to ${subject.iri}`, { iri: ctx.resource });
        }
        return { target, deletes, inserts: [] };
    }
    const taken = collectTakenIds(ctx);
    const inserts = [];
    for (const authorization of ctx.authorizations) {
        const isMember = authorization[subject.type].includes(subject.iri);
        if (isMember && subjectCount(authorization) === 1)
            continue;
        inserts.push(...cloneRuleQuads({
            ctx,
            taken,
            newId,
            authorization,
            without: isMember ? subject : undefined,
        }));
    }
    return { target, deletes: [], inserts };
}
function planPublicRead(ctx, enabled, options) {
    return enabled ? planGrant(ctx, Public, ['Read'], options) : planRevoke(ctx, Public);
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
function serializeTerm(term) {
    switch (term.termType) {
        case 'NamedNode':
            return '<' + term.value + '>';
        case 'BlankNode':
            return '_:' + term.value;
        case 'Literal': {
            const escaped = term.value
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            let out = '"' + escaped + '"';
            if (term.language) {
                out += '@' + term.language;
            }
            else if (term.datatype && term.datatype.value !== XSD_STRING && term.datatype.value !== LANG_STRING) {
                out += '^^<' + term.datatype.value + '>';
            }
            return out;
        }
        case 'Variable':
            return '?' + term.value;
        // DefaultGraph and quoted triples have no place in a patch clause
        default:
            throw new WACError(`Cannot serialize a ${term.termType} term`);
    }
}
function serializeTriples(quads) {
    return quads
        .map(q => serializeTerm(q.subject) + ' ' + serializeTerm(q.predicate) + ' ' + serializeTerm(q.object) + ' .')
        .join('\n');
}
function variableNames(quads) {
    const names = new Set();
    for (const q of quads) {
        for (const term of [q.subject, q.predicate, q.object]) {
            if (term.termType === 'Variable')
                names.add(term.value);
        }
    }
    return names;
}
function hasBlankNode(quads) {
    return quads.some(q => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode');
}
// A patch cannot delete or match blank nodes, and variables must be bound by the where clause.
function assertPatchClauses(plan) {
    const where = plan.where ?? [];
    if (hasBlankNode(plan.deletes)) {
        throw new WACError('A patch cannot delete triples containing blank nodes', { iri: plan.target });
    }
    if (hasBlankNode(where)) {
        throw new WACError('Use variables rather than blank nodes in a where clause', { iri: plan.target });
    }
    const bound = variableNames(where);
    for (const name of variableNames([...plan.deletes, ...plan.inserts])) {
        if (!bound.has(name)) {
            throw new WACError(`Variable ?${name} in the patch does not occur in the where clause`, { iri: plan.target });
        }
    }
}
function toSparqlUpdate(plan) {
    assertPatchClauses(plan);
    // pattern form: one DELETE/INSERT/WHERE operation
    if (plan.where?.length) {
        const clauses = [];
        if (plan.deletes.length)
            clauses.push('DELETE {\n' + serializeTriples(plan.deletes) + '\n}');
        if (plan.inserts.length)
            clauses.push('INSERT {\n' + serializeTriples(plan.inserts) + '\n}');
        if (!clauses.length)
            return '';
        return clauses.join('\n') + '\nWHERE {\n' + serializeTriples(plan.where) + '\n}';
    }
    const statements = [];
    if (plan.deletes.length) {
        statements.push('DELETE DATA {\n' + serializeTriples(plan.deletes) + '\n}');
    }
    if (plan.inserts.length) {
        statements.push('INSERT DATA {\n' + serializeTriples(plan.inserts) + '\n}');
    }
    return statements.join(';\n');
}
function toN3Patch(plan) {
    assertPatchClauses(plan);
    // N3 Patch formulae must not contain blank nodes, unlike SPARQL INSERT DATA
    if (hasBlankNode(plan.inserts)) {
        throw new WACError('N3 Patch formulae cannot contain blank nodes; use IRIs', { iri: plan.target });
    }
    const clauses = [];
    if (plan.where?.length) {
        clauses.push('solid:where {\n' + serializeTriples(plan.where) + '\n}');
    }
    if (plan.deletes.length) {
        clauses.push('solid:deletes {\n' + serializeTriples(plan.deletes) + '\n}');
    }
    if (plan.inserts.length) {
        clauses.push('solid:inserts {\n' + serializeTriples(plan.inserts) + '\n}');
    }
    // blank node labels are document-scoped, so any label conforms
    const uuid = globalThis.crypto?.randomUUID?.();
    const subject = '_:' + (uuid ?? Math.random().toString(36).slice(2, 10));
    return '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n' +
        subject + ' a solid:InsertDeletePatch' +
        (clauses.length ? ';\n' + clauses.join(';\n') : '') +
        '.\n';
}

/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/** Prefers text/n3, and assumes it when no Accept-Patch information is available. */
async function negotiatePatchContentType(target, options) {
    const { fetch = globalThis.fetch } = options ?? {};
    let acceptPatch = null;
    try {
        const response = await fetch(target, { method: 'OPTIONS' });
        acceptPatch = response.headers.get('Accept-Patch');
    }
    catch {
        return 'text/n3';
    }
    if (!acceptPatch)
        return 'text/n3';
    const types = acceptPatch.split(',').map(t => t.split(';')[0].trim().toLowerCase());
    if (types.includes('text/n3') || types.includes('*/*'))
        return 'text/n3';
    if (types.includes('application/sparql-update'))
        return 'application/sparql-update';
    throw new PatchApplyError(`PATCH media type not supported: ${target} accepts ${acceptPatch}`, { iri: target });
}
async function applyPlan(plan, options) {
    const { fetch = globalThis.fetch } = options ?? {};
    const contentType = options?.contentType ?? await negotiatePatchContentType(plan.target, { fetch });
    const body = contentType === 'text/n3' ? toN3Patch(plan) : toSparqlUpdate(plan);
    let response;
    try {
        response = await fetch(plan.target, {
            method: 'PATCH',
            headers: { 'Content-Type': contentType },
            body,
        });
    }
    catch (cause) {
        throw new PatchApplyError(`Failed to PATCH ${plan.target}`, { iri: plan.target, cause });
    }
    if (!response.ok) {
        throw new PatchApplyError(`Failed to PATCH ${plan.target}: ${response.status}`, {
            iri: plan.target,
            status: response.status,
        });
    }
    return response;
}

// src/acl/aclLogic.ts
var v$1 = [
	"Owner",
	"Editor",
	"No Access",
	"Viewer",
	"Poster",
	"Submitter"
], y = ["No Access", "Viewer"], b$1 = "Owner (write locked)";
function x(e, t, n = false) {
	let r = n && (t.default?.length ?? 0) > 0, i = r || (t.accessTo?.includes(e) ?? false), a = r || (t.default?.includes(e) ?? false);
	if (i && a) return "folder+contents";
	if (i) return "folder";
	if (a) return "contents";
}
function S(e, t, n, r = false) {
	return t.filter((t) => x(e, t, r) === n);
}
function C(e) {
	return w(e).primaryScope;
}
function w(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.authorizations ?? []) {
		let r = x(e.resource, n, e.inherited);
		r && t.add(r);
	}
	if (!t.size) {
		let n = /* @__PURE__ */ new Map();
		for (let t of e.dataset ?? []) {
			if (t.object.value !== e.resource || t.predicate.value !== ACL + "accessTo" && t.predicate.value !== ACL + "default") continue;
			let r = n.get(t.subject.value) ?? {
				accessTo: false,
				default: false
			};
			r.accessTo ||= t.predicate.value === ACL + "accessTo", r.default ||= t.predicate.value === ACL + "default", n.set(t.subject.value, r);
		}
		for (let e of n.values()) e.accessTo && e.default ? t.add("folder+contents") : e.accessTo ? t.add("folder") : e.default && t.add("contents");
	}
	let n = [...t];
	return {
		distinctScopes: n,
		primaryScope: n.includes("folder+contents") ? "folder+contents" : n.includes("contents") ? "contents" : n.includes("folder") ? "folder" : "folder+contents",
		mixed: n.length > 1
	};
}
var T = sym("http://www.iana.org/assignments/link-relations/acl");
function E(c) {
	let u = n$7, v = [
		{
			label: "Owner",
			modes: [
				"Read",
				"Write",
				"Control"
			]
		},
		{
			label: b$1,
			modes: ["Read", "Control"]
		},
		{
			label: "Editor",
			modes: ["Read", "Write"]
		},
		{
			label: "Poster",
			modes: ["Append", "Read"]
		},
		{
			label: "Submitter",
			modes: ["Append"]
		},
		{
			label: "Viewer",
			modes: ["Read"]
		},
		{
			label: "No Access",
			modes: []
		}
	], x = [{
		label: "Viewer",
		modes: ["Read"]
	}, {
		label: "No Access",
		modes: []
	}];
	function S(e) {
		let t = new Set(e);
		return v.find((e) => e.modes.length === t.size && e.modes.every((e) => t.has(e)))?.label ?? "No Access";
	}
	function w(e) {
		return [...v.find((t) => t.label === e)?.modes ?? []];
	}
	function E(e) {
		let t = new Set(e);
		return x.find((e) => e.label !== "No Access" && e.modes.every((e) => t.has(e)))?.label ?? "No Access";
	}
	function D(e) {
		return [...x.find((t) => t.label === e)?.modes ?? []];
	}
	function O() {
		let e = c.fetcher, t = e?._fetch ?? e?.fetch;
		if (!t) throw Error("Cannot find effective ACL, store has no fetcher");
		return t.bind(e);
	}
	async function k(e) {
		await c.fetcher.load(e);
		let t = c.any(e, T);
		if (!t) throw Error(`No ACL link discovered for ${e}`);
		return t.value;
	}
	async function A(e) {
		let t = typeof e == "string" ? e : e.value;
		return findEffectiveACL(t, { fetch: O() });
	}
	async function j(e) {
		return (await A(e)).authorizations;
	}
	function ee(e) {
		return C(e);
	}
	function M(e) {
		let t = sym(typeof e == "string" ? e : e.value);
		return t.value === t.site().value || typeof c.holds == "function" && c.holds(t, u.rdf("type"), u.space("Storage"), t.doc());
	}
	function N(e, t) {
		return t[{
			agent: "agent",
			agentGroup: "agentGroup",
			agentClass: "agentClass",
			origin: "origin"
		}[e.type]]?.includes(e.iri) ?? false;
	}
	function P(e, t) {
		if (!M(e.resource)) return;
		let n = new Set(t.deletes.map((e) => e.subject.value)), r = /* @__PURE__ */ new Map();
		for (let e of t.inserts) {
			let t = r.get(e.subject.value) ?? {
				modes: [],
				accessTo: []
			};
			e.predicate.value === ACL + "mode" ? t.modes.push(e.object.value) : e.predicate.value === ACL + "accessTo" && t.accessTo.push(e.object.value), r.set(e.subject.value, t);
		}
		if (!(!e.inherited && e.authorizations.some((t) => !n.has(t.id) && t.mode.includes("Control") && t.accessTo.includes(e.resource)) || [...r.values()].some((t) => t.modes.includes(ACL + "Control") && t.accessTo.includes(e.resource)))) throw Error("The protected storage resource must retain at least one Control authorization.");
	}
	function F(e, t) {
		if (!new URL(e.resource).pathname.endsWith("/")) return t;
		let n = t.inserts.filter((t) => t.predicate.value === ACL + "accessTo" && t.object.value === e.resource).filter((n) => !t.inserts.some((t) => t.subject.equals(n.subject) && t.predicate.value === ACL + "default" && t.object.value === e.resource)).map((e) => quad(e.subject, namedNode(ACL + "default"), e.object));
		return {
			...t,
			inserts: [...t.inserts, ...n]
		};
	}
	async function I(e, t, n) {
		let r = await A(e);
		if (r.inherited && new URL(r.resource).pathname.endsWith("/")) {
			let e = W(r, t, n, "folder");
			return P(r, e), e;
		}
		let i = planGrant(r, t, n);
		return P(r, i), i;
	}
	function L(e) {
		if (!new URL(e.resource).pathname.endsWith("/")) throw Error(`Expected a container URL ending in "/": ${e.resource}`);
	}
	let R = [
		"agent",
		"agentClass",
		"agentGroup",
		"origin"
	], z = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", B = /* @__PURE__ */ new Set([
		z,
		ACL + "client",
		ACL + "clientClass",
		ACL + "clientGroup",
		ACL + "issuer",
		ACL + "issuerClass",
		ACL + "issuerGroup",
		ACL + "description",
		ACL + "ClientCondition",
		ACL + "IssuerCondition"
	]), V = /* @__PURE__ */ new Set([ACL + "ClientCondition", ACL + "IssuerCondition"]);
	function H(e) {
		let t = /* @__PURE__ */ new Set([...(e.dataset ?? []).map((e) => e.subject.value), ...e.authorizations.flatMap((e) => [e.id, ...(e.condition ?? []).map((e) => e.id)])]);
		return (e) => {
			let n = e, r = 1;
			for (; t.has(n);) n = `${e}-${r++}`;
			return t.add(n), n;
		};
	}
	function U(e) {
		for (let t of e.authorizations) for (let e of t.condition ?? []) {
			let t = e.properties[z] ?? [];
			if (t.length > 1 || t.length === 1 && !V.has(t[0])) throw Error(`Unsupported ACL condition type on ${e.id}`);
			for (let t of Object.keys(e.properties)) if (!B.has(t)) throw Error(`Unsupported ACL condition property: ${t}`);
		}
	}
	function W(e, t, n, r, i = false) {
		let a = [], s = t.type, c = H(e);
		U(e);
		let l = (t, n, r, i) => {
			let s = R.flatMap((e) => t[e].map((t) => ({
				key: e,
				iri: t
			})));
			if (!s.length || !r.accessTo && !r.default) return;
			let l = c(n), u = namedNode(l);
			a.push(quad(u, namedNode(z), namedNode(ACL + "Authorization")), ...r.accessTo ? [quad(u, namedNode(ACL + "accessTo"), namedNode(e.resource))] : [], ...r.default ? [quad(u, namedNode(ACL + "default"), namedNode(e.resource))] : [], ...(i ?? t.mode).map((e) => quad(u, namedNode(ACL + "mode"), namedNode(`http://www.w3.org/ns/auth/acl#${e}`))), ...s.map(({ key: e, iri: t }) => quad(u, namedNode(ACL + e), namedNode(t))), ...(t.condition ?? []).flatMap((t) => {
				let n = c(`${l}-condition`), r = namedNode(n), i = e.dataset.filter((e) => e.subject.value === t.id).map((e) => quad(r, e.predicate, e.object));
				return [quad(u, namedNode(ACL + "condition"), r), ...i];
			}));
		}, u = (e) => ({
			...e,
			[s]: e[s].filter((e) => e !== t.iri)
		}), d = (e) => ({
			...e,
			agent: [],
			agentClass: [],
			agentGroup: [],
			origin: [],
			[s]: [t.iri]
		});
		if (e.authorizations.forEach((n, i) => {
			let a = `${e.defaultACLResource}#inherited-${i + 1}`, o = (n.default?.length ?? 0) > 0, c = {
				accessTo: o || n.accessTo.includes(e.resource),
				default: o
			};
			n[s]?.includes(t.iri) ?? false ? (l(u(n), a, c), l(d(n), `${a}-retained`, {
				accessTo: c.accessTo && r === "contents",
				default: c.default && r === "folder"
			})) : l(n, a, c);
		}), !i) {
			let i = e.authorizations.find((e) => e[s]?.includes(t.iri) && (e.default?.length ?? 0) > 0);
			l(d({
				id: `${e.defaultACLResource}#inherited-new-source`,
				blankNode: false,
				accessTo: [],
				default: [],
				agent: [],
				agentClass: [],
				agentGroup: [],
				origin: [],
				mode: [],
				condition: i?.condition ?? []
			}), `${e.defaultACLResource}#inherited-new`, {
				accessTo: r !== "contents",
				default: r !== "folder"
			}, n ?? []);
		}
		return {
			target: e.defaultACLResource,
			deletes: [],
			inserts: a
		};
	}
	async function G(e, t, n) {
		let r = await A(e);
		L(r);
		let i = r.inherited ? W(r, t, n, "folder") : planGrant(r, t, n);
		return P(r, i), i;
	}
	async function K(e, t, n) {
		let r = await A(e);
		L(r);
		let i = r.inherited ? W(r, t, n, "folder+contents") : F(r, planGrant(r, t, n));
		return P(r, i), i;
	}
	async function q(e, t, n) {
		let r = await A(e);
		if (L(r), M(r.resource)) throw Error("Applying access to the contents of a protected storage resource is not allowed.");
		if (r.inherited) return W(r, t, n, "contents");
		let i = r.authorizations.filter((e) => e.default?.includes(r.resource) && N(t, e));
		if (i.length) return Y(r, i, t, n);
		let a = t.type, s = H(r)(`${r.defaultACLResource}#contents-1`), c = namedNode(s), l = quad(c, namedNode(ACL + a), namedNode(t.iri)), u = [
			quad(c, namedNode(z), namedNode(ACL + "Authorization")),
			quad(c, namedNode(ACL + "default"), namedNode(r.resource)),
			...n.map((e) => quad(c, namedNode(ACL + "mode"), namedNode(`http://www.w3.org/ns/auth/acl#${e}`))),
			l
		];
		return {
			target: r.defaultACLResource,
			deletes: [],
			inserts: u
		};
	}
	async function J(e, t) {
		let n = await A(e);
		if (L(n), M(n.resource)) throw Error("Removing access from the contents of a protected storage resource is not allowed.");
		let r = ACL + "default";
		if (!n.inherited) {
			let e = n.authorizations.filter((e) => e.default?.includes(n.resource) && N(t, e));
			if (e.length) return Y(n, e, t);
			let i = n.dataset.filter((e) => e.predicate.value === r && e.object.value === n.resource && n.authorizations.some((n) => n.id === e.subject.value && n[t.type].includes(t.iri)));
			if (!i.length) throw Error(`No default authorization found for ${t.iri}`);
			return {
				target: n.defaultACLResource,
				deletes: i,
				inserts: []
			};
		}
		if (!n.authorizations.some((e) => e.default?.includes(n.resource) && N(t, e))) throw Error(`No default authorization found for ${t.iri}`);
		return W(n, t, void 0, "contents", true);
	}
	function Y(e, t, n, r) {
		let i = H(e), a = [], s = (e, t, n, r, i, s) => {
			t.length && (r.length || i.length) && a.push(quad(e, namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), namedNode(ACL + "Authorization")), ...r.map((t) => quad(e, namedNode(ACL + "accessTo"), namedNode(t))), ...i.map((t) => quad(e, namedNode(ACL + "default"), namedNode(t))), ...n.map((t) => quad(e, namedNode(ACL + "mode"), namedNode(`http://www.w3.org/ns/auth/acl#${t}`))), ...s.map((t) => quad(e, namedNode(ACL + "condition"), namedNode(t))), ...t.map(({ key: t, iri: n }) => quad(e, namedNode(ACL + t), namedNode(n))));
		}, c = [];
		return t.forEach((t, a) => {
			let l = R.flatMap((e) => t[e].map((t) => ({
				key: e,
				iri: t
			}))), u = l.filter(({ key: e, iri: t }) => e !== n.type || t !== n.iri), d = `${e.defaultACLResource}#split-${a + 1}`;
			if (!r && l.length === 1 && u.length === 0) {
				c.push(...e.dataset.filter((n) => n.subject.value === t.id && n.predicate.value === ACL + "default" && n.object.value === e.resource));
				return;
			}
			c.push(...e.dataset.filter((e) => e.subject.value === t.id));
			let f = (t.condition ?? []).map((e) => e.id);
			s(namedNode(i(`${e.defaultACLResource}#retained-${a + 1}`)), u, t.mode, t.accessTo, t.default, f);
			let m = t.default.filter((t) => t !== e.resource);
			(t.accessTo.length || m.length) && s(namedNode(i(`${d}-retained`)), [{
				key: n.type,
				iri: n.iri
			}], t.mode, t.accessTo, m, f), r && s(namedNode(i(`${d}`)), [{
				key: n.type,
				iri: n.iri
			}], r, [], t.default.filter((t) => t === e.resource), f);
		}), {
			target: e.defaultACLResource,
			deletes: c,
			inserts: a
		};
	}
	async function X(e, t) {
		let n = await A(e);
		if (n.inherited && new URL(n.resource).pathname.endsWith("/")) {
			let e = W(n, t, void 0, "folder+contents", true);
			return P(n, e), e;
		}
		let r = F(n, planRevoke(n, t));
		return P(n, r), r;
	}
	async function Z(e, t) {
		let n = await A(e);
		return planPublicRead(n, t);
	}
	async function Q(e) {
		let t = await A(e);
		if (M(t.resource)) throw Error("The protected storage resource cannot be reset to a default ACL.");
		let n = await O()(t.defaultACLResource, { method: "DELETE" });
		if (!n.ok && n.status !== 404) throw Error(`Unable to remove ACL ${t.defaultACLResource}: HTTP ${n.status}`);
		return n;
	}
	async function te(e) {
		return applyPlan(e, { fetch: O() });
	}
	async function ne(e) {
		return c$5(c, e);
	}
	function re(e, t, n) {
		let r = c.any(c.sym(e), T);
		return Promise.resolve().then(() => r || ie(e).catch((t) => {
			throw Error(`Error fetching rel=ACL header for ${e}: ${t}`);
		})).then((r) => {
			let i = $(e, t, r.uri, n);
			if (!c.fetcher) throw Error("Cannot PUT this, store has no fetcher");
			return c.fetcher.webOperation("PUT", r.uri, {
				data: i,
				contentType: "text/turtle"
			}).then((e) => {
				if (!e.ok) throw Error("Error writing ACL text: " + e.error);
				return r;
			});
		});
	}
	function ie(e) {
		let t = c.fetcher;
		if (!t) throw Error("Cannot fetch ACL rel, store has no fetcher");
		return t.load(e).then((t) => {
			if (!t.ok) throw Error("fetchACLRel: While loading:" + t.error);
			let n = c.any(c.sym(e), T);
			if (!n) throw Error("fetchACLRel: No Link rel=ACL header for " + e);
			return n;
		});
	}
	function $(e, t, a, o = {}) {
		let s = o.public || [], c = graph(), l = Namespace("http://www.w3.org/ns/auth/acl#"), d = c.sym(`${a}#a1`), f = c.sym(a), p = c.sym(e);
		if (c.add(d, u.rdf("type"), l("Authorization"), f), c.add(d, l("accessTo"), p, f), o.defaultForNew && c.add(d, l("default"), p, f), c.add(d, l("agent"), t, f), c.add(d, l("mode"), l("Read"), f), c.add(d, l("mode"), l("Write"), f), c.add(d, l("mode"), l("Control"), f), s.length) {
			d = c.sym(`${a}#a2`), c.add(d, u.rdf("type"), l("Authorization"), f), c.add(d, l("accessTo"), p, f), c.add(d, l("agentClass"), u.foaf("Agent"), f);
			for (let e = 0; e < s.length; e++) c.add(d, l("mode"), l(s[e]), f);
		}
		return serialize(f, c, a);
	}
	return {
		findAclDocUrl: k,
		findEffectiveAcl: A,
		findAccessGrants: j,
		classifyContainerScope: ee,
		isProtectedResource: M,
		roleFromModes: S,
		modesFromRole: w,
		publicRoleFromModes: E,
		modesFromPublicRole: D,
		planGrant: I,
		planGrantContainer: G,
		planGrantContainerAndContents: K,
		planGrantContainerContents: q,
		planRevokeContainerContents: J,
		planRevoke: X,
		planPublicRead: Z,
		resetToDefault: Q,
		applyPlan: te,
		classifyAccessControlSubject: ne,
		setACLUserPublic: re,
		genACLText: $,
		Authenticated: Authenticated,
		Public: Public,
		PUBLIC_ACCESS_ROLES: y
	};
}

// src/authn/authUtil.ts
var n$6 = () => {
	let { SolidAppContext: e } = window;
	if (e ||= {}, e.viewingNoAuthPage = false, e.noAuth && window.document && window.document.location.href.startsWith(e.noAuth)) {
		e.viewingNoAuthPage = true;
		let t = new URLSearchParams(window.document.location.search);
		if (t) {
			let n = e.viewedPage = t.get("uri") || null;
			if (n && (n = decodeURI(n), !n.startsWith(e.noAuth))) {
				let t = n.split(/\//);
				e.idp = t[0] + "//" + t[2], e.viewingNoAuthPage = false;
			}
		}
	}
	return e;
};
function r$6() {
	let { $SolidTestEnvironment: n } = window;
	if (n !== void 0 && n.username) return e$d("Assuming the user is " + n.username), sym(n.username);
	if (typeof document < "u" && document.location && ("" + document.location).slice(0, 16) === "http://localhost") {
		let n = document.getElementById("appTarget");
		if (!n) return null;
		let r = n.getAttribute("testID");
		return r ? (e$d("Assuming user is " + r), sym(r)) : null;
	}
	return null;
}

// src/authn/SolidAuthnLogic.ts
var u$3 = 5e3;
async function d$2(e) {
	if (e === null) return;
	let t, n = new Promise((e) => {
		t = setTimeout(() => e(void 0), u$3);
	});
	try {
		return await Promise.race([e, n]);
	} finally {
		t !== void 0 && clearTimeout(t);
	}
}
var f$1 = class f {
	constructor(e) {
		this.checkUserInFlight = null, this.sessionRestoreHookAttached = false, this.session = e, this.identity = x$1(e, { onRefocus: () => this.refreshCookieBackedFallback() });
	}
	dispose() {
		this.identity.unsubscribe();
	}
	async refreshCookieBackedFallback() {
		l$4(this.session) || this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId());
	}
	get authSession() {
		return this.session;
	}
	currentUser() {
		let n = n$6();
		if (n.viewingNoAuthPage) return sym(n.webId);
		let { webId: i } = d$3(this.session);
		return i ? sym(i) : r$6();
	}
	async checkUser(e) {
		let t = new URL(window.location.href).hash;
		t && window.localStorage.setItem("preLoginRedirectHash", t);
		let r = this.session;
		!this.sessionRestoreHookAttached && typeof r?.events?.on == "function" && (r.events.on("sessionRestore", (e) => {
			e$d(`Session restored to ${e}`), document.location.toString() !== e && history.replaceState(null, "", e);
		}), this.sessionRestoreHookAttached = true), this.checkUserInFlight ||= this.resolveCurrentUser();
		let i = this.checkUserInFlight, a;
		try {
			a = await i;
		} finally {
			this.checkUserInFlight === i && (this.checkUserInFlight = null);
		}
		return Promise.resolve(e ? e(a) : a);
	}
	async resolveCurrentUser() {
		let e = this.session, a = new URL(window.location.href);
		if (a.hash = "", typeof e?.handleIncomingRedirect == "function") await e.handleIncomingRedirect({
			restorePreviousSession: true,
			url: a.href
		});
		else {
			let t = e?.isActive ?? !!e?.webId, r = p$2(e);
			if (r) {
				try {
					await d$2(r);
				} catch (t) {
					let r = t instanceof Error ? t.message : String(t);
					if ((e?.isActive ?? !!e?.webId) && !/no session to restore/i.test(r)) throw t;
					e$d(`Session restore failed, continuing logged-out: ${r}`);
				}
				let i = e?.isActive ?? !!e?.webId;
				!t && i && e.events?.emit("sessionRestore", window.location.href);
			}
			if (typeof e?.handleRedirectFromLogin == "function") {
				let t = e?.isActive ?? !!e?.webId;
				await e.handleRedirectFromLogin();
				let n = e?.isActive ?? !!e?.webId;
				!t && n && e.events?.emit("login");
			}
		}
		let o = window.localStorage.getItem("preLoginRedirectHash");
		if (o) {
			let e = new URL(window.location.href);
			e.hash !== o && (history.pushState ? history.pushState(null, document.title, o) : location.hash = o, e.hash = o), window.localStorage.setItem("preLoginRedirectHash", "");
		}
		let s = r$6();
		if (s) return s;
		let c = this.webIdFromSession(e?.info, e);
		return c ||= (this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId()), d$3(e).webId ?? null), c && (s = this.saveUser(c)), s && e$d(`(Logged in as ${s} by authentication)`), s;
	}
	async probeNssCookieBackedWebId() {
		if (typeof window > "u") return null;
		let { hostname: e, port: t, protocol: n } = window.location;
		if (!e.endsWith(".localhost")) return null;
		let r = e.slice(0, -10);
		if (!r || r === "localhost" || r.includes(".")) return null;
		try {
			return (await fetch("/account/password/change", {
				credentials: "include",
				redirect: "manual",
				cache: "no-store"
			})).status === 403 ? `${`${n}//${e}${t ? `:${t}` : ""}`}/profile/card#me` : null;
		} catch {
			return null;
		}
	}
	saveUser(e, t) {
		let n;
		if (e) {
			n = typeof e == "string" ? e : e.uri;
			let r = namedNode$1(n);
			return t && (t.me = r), r;
		}
		return null;
	}
	webIdFromSession(e, t) {
		let n = e?.webId || t?.webId;
		if (!n) return null;
		let r = e?.isLoggedIn, i = t?.isLoggedIn, a = t?.isActive;
		return s$9(t) || r === false || i === false || a === false ? null : n;
	}
};

// src/authSession/flagAuthorizationOnTransitions.ts
function n$5(t) {
	try {
		let e = t.updater?.flagAuthorizationMetadata;
		if (typeof e != "function") throw Error("flagAuthorizationMetadata is unavailable");
		return e.call(t.updater), !0;
	} catch (t) {
		return t$a(`Could not flag authorization metadata: ${String(t)}`), false;
	}
}
function r$5(e, r) {
	let i = x$1(r, { onTransition: () => {
		let t = o$8(e);
		t.generation += 1, t.invalidationFailed = !n$5(e);
	} });
	return () => i.unsubscribe();
}
var i$5 = /* @__PURE__ */ new WeakMap(), a$5 = {
	generation: 0,
	invalidationFailed: false
};
function o$8(e) {
	if (typeof e != "object" || !e) return a$5;
	let t = i$5.get(e);
	return t || (t = {
		generation: 0,
		invalidationFailed: false
	}, i$5.set(e, t)), t;
}
var s$6 = 3;
async function c$4(t, r) {
	let i = o$8(t), a = t.fetcher?.load;
	if (typeof a == "function") for (let o = 0; o < s$6; o++) {
		let o = i.generation;
		if (!n$5(t)) return;
		i.invalidationFailed = false;
		try {
			await a.call(t.fetcher, r);
		} catch (t) {
			t$a(`Could not reload ${String(r)}: ${String(t)}`);
			return;
		}
		if (o === i.generation) return t.updater?.editable?.(r);
	}
}
async function l$2(e, t) {
	return !o$8(e).invalidationFailed && e.updater?.editable?.(t) !== void 0 || await c$4(e, t) !== void 0;
}
async function u$2(e, t) {
	let n = o$8(e), r = n.generation, i = e.fetcher?.load;
	if (typeof i != "function") throw Error("fetcher.load is unavailable");
	return await i.call(e.fetcher, t), r === n.generation ? l$2(e, t) : await c$4(e, t) !== void 0;
}

// src/util/utils.ts
function n$4(e) {
	return sym(e.uri + "#id" + ("" + Date.now()));
}
function r$4(e, t) {
	let n = t.getUTCFullYear(), r = ("0" + (t.getUTCMonth() + 1)).slice(-2), i = ("0" + t.getUTCDate()).slice(-2), a = e.split("/"), o = a[a.length - 1];
	return new URL(`./archive/${n}/${r}/${i}/${o}`, e).toString();
}
function i$4(e) {
	return !e || `${window.location.origin}/` !== new URL(e.value).origin;
}
function a$4(e) {
	let n = e.uri.replace("/profile/", "/").replace("/public/", "/").split("/").slice(0, -1).join("/") + "/settings/prefs.ttl";
	return sym(n);
}
function o$7(t, n) {
	let r = new URL(`IndividualChats/${new URL(t.value).host}/`, n.value).toString();
	return new NamedNode$1(r);
}

// src/chat/chatLogic.ts
var o$6 = "index.ttl#this";
function s$5(s, c) {
	let l = n$7;
	async function u(e, t, n) {
		await s.fetcher.load(e);
		let i = s.any(e, new NamedNode$1("http://www.iana.org/assignments/link-relations/acl"));
		if (!i) throw Error("Chat ACL doc not found!");
		let a = `
            @prefix acl: <http://www.w3.org/ns/auth/acl#>.
            <#owner>
            a acl:Authorization;
            acl:agent <${t.value}>;
            acl:accessTo <.>;
            acl:default <.>;
            acl:mode
                acl:Read, acl:Write, acl:Control.
            <#invitee>
            a acl:Authorization;
            acl:agent <${n.value}>;
            acl:accessTo <.>;
            acl:default <.>;
            acl:mode
                acl:Read, acl:Append.
            `;
		await s.fetcher.webOperation("PUT", i.value, {
			data: a,
			contentType: "text/turtle"
		});
	}
	async function d(e, t) {
		let r = s.any(t, l.solid("privateTypeIndex"));
		if (!r) throw Error("Private type index not found!");
		await s.fetcher.load(r);
		let a = n$4(r), o = [
			st(a, l.rdf("type"), l.solid("TypeRegistration"), r.doc()),
			st(a, l.solid("forClass"), l.meeting("LongChat"), r.doc()),
			st(a, l.solid("instance"), e, r.doc())
		];
		await new Promise((e, t) => {
			s.updater.update([], o, function(n, r, i) {
				r ? e(null) : t(Error(i));
			});
		});
	}
	async function f(e) {
		let n = await c.loadMe(), i = await c.getPodRoot(n), a = o$7(e, i), o = true;
		try {
			await s.fetcher.load(new NamedNode$1(a.value + "index.ttl#this"));
		} catch {
			o = false;
		}
		return {
			me: n,
			chatContainer: a,
			exists: o
		};
	}
	async function p(e, t) {
		return (await m({
			me: t,
			newBase: e.value
		})).newInstance;
	}
	function m(e) {
		let t = s, n = t.updater;
		if (e.me && !e.me.uri) throw Error("chat mintNew:  Invalid userid " + e.me);
		let r = e.newInstance = e.newInstance || t.sym(e.newBase + o$6), i = r.doc();
		return t.add(r, l.rdf("type"), l.meeting("LongChat"), i), t.add(r, l.dc("title"), "Chat channel", i), t.add(r, l.dc("created"), term(new Date(Date.now())), i), e.me && t.add(r, l.dc("author"), e.me, i), new Promise(function(a, o) {
			n?.put(i, t.statementsMatching(void 0, void 0, void 0, i), "text/turtle", function(t, n, i) {
				n ? a({
					...e,
					newInstance: r
				}) : o(/* @__PURE__ */ Error("FAILED to save new chat channel at: " + t + " : " + i));
			});
		});
	}
	async function h(e, t = true) {
		let { me: n, chatContainer: i, exists: a } = await f(e);
		if (a) return new NamedNode$1(i.value + o$6);
		if (t) {
			let t = await p(i, n);
			return await g(e, t), await u(i, n, e), await d(t, n), t;
		}
		return null;
	}
	async function g(e, t) {
		await s.fetcher.load(e.doc());
		let n = s.any(e, l.ldp("inbox"), void 0, e.doc());
		if (!n) throw Error(`Invitee inbox not found! ${e.value}`);
		let r = `
        <> a <http://www.w3.org/ns/pim/meeting#LongChatInvite> ;
        ${l.rdf("seeAlso")} <${t.value}> .
        `, i = await s.fetcher?.webOperation("POST", n.value, {
			data: r,
			contentType: "text/turtle"
		});
		if (!i?.headers.get("location")) throw Error(`Invite sending returned a ${i?.status}`);
	}
	return {
		setAcl: u,
		addToPrivateTypeIndex: d,
		findChat: f,
		createChatThing: p,
		getChat: h,
		sendInvite: g,
		mintNew: m
	};
}

// src/inbox/inboxLogic.ts
function t$6(t, n, r, i, a) {
	async function o(e, t) {
		let a = await n.loadMe(), o = `${(await n.getPodRoot(a)).value}p2p-inboxes/${encodeURIComponent(t)}/`;
		return await i.createContainer(o), await r.setSinglePeerAccess({
			ownerWebId: a.value,
			peerWebId: e,
			accessToModes: "acl:Append",
			target: o
		}), o;
	}
	async function s(e) {
		e ||= await n.loadMe();
		let t = await n.getMainInbox(e);
		return (await i.getContainerMembers(t)).filter((e) => !i.isContainer(e));
	}
	async function c(n, r) {
		let i = await t.fetcher._fetch(n);
		if (i.status !== 200) throw Error(`Not OK! ${n}`);
		let a = r$4(n, r), o = {
			method: "PUT",
			body: await i.text(),
			headers: [["Content-Type", i.headers.get("Content-Type") || "application/octet-stream"]]
		};
		(await t.fetcher._fetch(a, o)).status.toString()[0] === "2" && await t.fetcher._fetch(n, { method: "DELETE" });
	}
	return {
		createInboxFor: o,
		getNewMessages: s,
		markAsRead: c
	};
}

// src/resource/resourceHttp.ts
function e$9(e) {
	return e?.status ?? e?.response?.status;
}
function t$5(e) {
	return e === 404 || e === 410;
}
function n$3(e, n, r = {}) {
	if (e.ok || r.allowNotFound && t$5(e.status)) return;
	let i = e.status === 412 ? "Error: File changed by someone else" : `HTTP error on ${n}! Status: ${e.status}`;
	throw Error(i);
}
function r$3(n) {
	if (t$5(e$9(n))) return true;
	let r = `${n?.message || n || ""}`;
	return r.includes("404") || r.includes("Not Found");
}

// src/resource/resourceMetadata.ts
function e$8(e) {
	let t = /* @__PURE__ */ new Map();
	if (!e) return t;
	for (let n of e.split(",")) {
		let e = n.trim().match(/^([A-Za-z]+)\s*=\s*"([^"]*)"$/);
		if (e) {
			let [, n, r] = e, i = r.trim().split(/\s+/).filter(Boolean);
			t.set(n.toLowerCase(), new Set(i.map((e) => e.toLowerCase())));
		}
	}
	return t;
}
function t$4(t) {
	if (!t) return {
		canEdit: false,
		canManageAccess: false,
		isPublic: false,
		isPublicKnown: false
	};
	let n = e$8(t), r = n.get("user") ?? /* @__PURE__ */ new Set(), i = n.get("public") ?? /* @__PURE__ */ new Set();
	return {
		canEdit: r.has("write"),
		canManageAccess: r.has("control"),
		isPublic: i.has("read") || i.has("write"),
		isPublicKnown: true
	};
}

// src/types.ts
var e$7 = class e extends Error {
	constructor(e, t, n) {
		super(e), this.destinationUri = t, this.status = n, this.name = "ResourceUploadError";
	}
};

var mimeTypes = {};

var require$$0 = {
	"application/1d-interleaved-parityfec": {
	source: "iana"
},
	"application/3gpdash-qoe-report+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/3gpp-ims+xml": {
	source: "iana",
	compressible: true
},
	"application/3gpphal+json": {
	source: "iana",
	compressible: true
},
	"application/3gpphalforms+json": {
	source: "iana",
	compressible: true
},
	"application/a2l": {
	source: "iana"
},
	"application/ace+cbor": {
	source: "iana"
},
	"application/ace+json": {
	source: "iana",
	compressible: true
},
	"application/ace-groupcomm+cbor": {
	source: "iana"
},
	"application/ace-trl+cbor": {
	source: "iana"
},
	"application/activemessage": {
	source: "iana"
},
	"application/activity+json": {
	source: "iana",
	compressible: true
},
	"application/aif+cbor": {
	source: "iana"
},
	"application/aif+json": {
	source: "iana",
	compressible: true
},
	"application/alto-cdni+json": {
	source: "iana",
	compressible: true
},
	"application/alto-cdnifilter+json": {
	source: "iana",
	compressible: true
},
	"application/alto-costmap+json": {
	source: "iana",
	compressible: true
},
	"application/alto-costmapfilter+json": {
	source: "iana",
	compressible: true
},
	"application/alto-directory+json": {
	source: "iana",
	compressible: true
},
	"application/alto-endpointcost+json": {
	source: "iana",
	compressible: true
},
	"application/alto-endpointcostparams+json": {
	source: "iana",
	compressible: true
},
	"application/alto-endpointprop+json": {
	source: "iana",
	compressible: true
},
	"application/alto-endpointpropparams+json": {
	source: "iana",
	compressible: true
},
	"application/alto-error+json": {
	source: "iana",
	compressible: true
},
	"application/alto-networkmap+json": {
	source: "iana",
	compressible: true
},
	"application/alto-networkmapfilter+json": {
	source: "iana",
	compressible: true
},
	"application/alto-propmap+json": {
	source: "iana",
	compressible: true
},
	"application/alto-propmapparams+json": {
	source: "iana",
	compressible: true
},
	"application/alto-tips+json": {
	source: "iana",
	compressible: true
},
	"application/alto-tipsparams+json": {
	source: "iana",
	compressible: true
},
	"application/alto-updatestreamcontrol+json": {
	source: "iana",
	compressible: true
},
	"application/alto-updatestreamparams+json": {
	source: "iana",
	compressible: true
},
	"application/aml": {
	source: "iana"
},
	"application/andrew-inset": {
	source: "iana",
	extensions: [
		"ez"
	]
},
	"application/appinstaller": {
	compressible: false,
	extensions: [
		"appinstaller"
	]
},
	"application/applefile": {
	source: "iana"
},
	"application/applixware": {
	source: "apache",
	extensions: [
		"aw"
	]
},
	"application/appx": {
	compressible: false,
	extensions: [
		"appx"
	]
},
	"application/appxbundle": {
	compressible: false,
	extensions: [
		"appxbundle"
	]
},
	"application/at+jwt": {
	source: "iana"
},
	"application/atf": {
	source: "iana"
},
	"application/atfx": {
	source: "iana"
},
	"application/atom+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"atom"
	]
},
	"application/atomcat+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"atomcat"
	]
},
	"application/atomdeleted+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"atomdeleted"
	]
},
	"application/atomicmail": {
	source: "iana"
},
	"application/atomsvc+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"atomsvc"
	]
},
	"application/atsc-dwd+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"dwd"
	]
},
	"application/atsc-dynamic-event-message": {
	source: "iana"
},
	"application/atsc-held+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"held"
	]
},
	"application/atsc-rdt+json": {
	source: "iana",
	compressible: true
},
	"application/atsc-rsat+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rsat"
	]
},
	"application/atxml": {
	source: "iana"
},
	"application/auth-policy+xml": {
	source: "iana",
	compressible: true
},
	"application/automationml-aml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"aml"
	]
},
	"application/automationml-amlx+zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"amlx"
	]
},
	"application/bacnet-xdd+zip": {
	source: "iana",
	compressible: false
},
	"application/batch-smtp": {
	source: "iana"
},
	"application/bdoc": {
	compressible: false,
	extensions: [
		"bdoc"
	]
},
	"application/beep+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/bufr": {
	source: "iana"
},
	"application/c2pa": {
	source: "iana"
},
	"application/calendar+json": {
	source: "iana",
	compressible: true
},
	"application/calendar+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xcs"
	]
},
	"application/call-completion": {
	source: "iana"
},
	"application/cals-1840": {
	source: "iana"
},
	"application/captive+json": {
	source: "iana",
	compressible: true
},
	"application/cbor": {
	source: "iana"
},
	"application/cbor-seq": {
	source: "iana"
},
	"application/cccex": {
	source: "iana"
},
	"application/ccmp+xml": {
	source: "iana",
	compressible: true
},
	"application/ccxml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"ccxml"
	]
},
	"application/cda+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/cdfx+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"cdfx"
	]
},
	"application/cdmi-capability": {
	source: "iana",
	extensions: [
		"cdmia"
	]
},
	"application/cdmi-container": {
	source: "iana",
	extensions: [
		"cdmic"
	]
},
	"application/cdmi-domain": {
	source: "iana",
	extensions: [
		"cdmid"
	]
},
	"application/cdmi-object": {
	source: "iana",
	extensions: [
		"cdmio"
	]
},
	"application/cdmi-queue": {
	source: "iana",
	extensions: [
		"cdmiq"
	]
},
	"application/cdni": {
	source: "iana"
},
	"application/ce+cbor": {
	source: "iana"
},
	"application/cea": {
	source: "iana"
},
	"application/cea-2018+xml": {
	source: "iana",
	compressible: true
},
	"application/cellml+xml": {
	source: "iana",
	compressible: true
},
	"application/cfw": {
	source: "iana"
},
	"application/cid-edhoc+cbor-seq": {
	source: "iana"
},
	"application/city+json": {
	source: "iana",
	compressible: true
},
	"application/city+json-seq": {
	source: "iana"
},
	"application/clr": {
	source: "iana"
},
	"application/clue+xml": {
	source: "iana",
	compressible: true
},
	"application/clue_info+xml": {
	source: "iana",
	compressible: true
},
	"application/cms": {
	source: "iana"
},
	"application/cnrp+xml": {
	source: "iana",
	compressible: true
},
	"application/coap-eap": {
	source: "iana"
},
	"application/coap-group+json": {
	source: "iana",
	compressible: true
},
	"application/coap-payload": {
	source: "iana"
},
	"application/commonground": {
	source: "iana"
},
	"application/concise-problem-details+cbor": {
	source: "iana"
},
	"application/conference-info+xml": {
	source: "iana",
	compressible: true
},
	"application/cose": {
	source: "iana"
},
	"application/cose-key": {
	source: "iana"
},
	"application/cose-key-set": {
	source: "iana"
},
	"application/cose-x509": {
	source: "iana"
},
	"application/cpl+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"cpl"
	]
},
	"application/csrattrs": {
	source: "iana"
},
	"application/csta+xml": {
	source: "iana",
	compressible: true
},
	"application/cstadata+xml": {
	source: "iana",
	compressible: true
},
	"application/csvm+json": {
	source: "iana",
	compressible: true
},
	"application/cu-seeme": {
	source: "apache",
	extensions: [
		"cu"
	]
},
	"application/cwl": {
	source: "iana",
	extensions: [
		"cwl"
	]
},
	"application/cwl+json": {
	source: "iana",
	compressible: true
},
	"application/cwl+yaml": {
	source: "iana"
},
	"application/cwt": {
	source: "iana"
},
	"application/cybercash": {
	source: "iana"
},
	"application/dart": {
	compressible: true
},
	"application/dash+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mpd"
	]
},
	"application/dash-patch+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mpp"
	]
},
	"application/dashdelta": {
	source: "iana"
},
	"application/davmount+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"davmount"
	]
},
	"application/dca-rft": {
	source: "iana"
},
	"application/dcd": {
	source: "iana"
},
	"application/dec-dx": {
	source: "iana"
},
	"application/dialog-info+xml": {
	source: "iana",
	compressible: true
},
	"application/dicom": {
	source: "iana",
	extensions: [
		"dcm"
	]
},
	"application/dicom+json": {
	source: "iana",
	compressible: true
},
	"application/dicom+xml": {
	source: "iana",
	compressible: true
},
	"application/dii": {
	source: "iana"
},
	"application/dit": {
	source: "iana"
},
	"application/dns": {
	source: "iana"
},
	"application/dns+json": {
	source: "iana",
	compressible: true
},
	"application/dns-message": {
	source: "iana"
},
	"application/docbook+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"dbk"
	]
},
	"application/dots+cbor": {
	source: "iana"
},
	"application/dpop+jwt": {
	source: "iana"
},
	"application/dskpp+xml": {
	source: "iana",
	compressible: true
},
	"application/dssc+der": {
	source: "iana",
	extensions: [
		"dssc"
	]
},
	"application/dssc+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xdssc"
	]
},
	"application/dvcs": {
	source: "iana"
},
	"application/eat+cwt": {
	source: "iana"
},
	"application/eat+jwt": {
	source: "iana"
},
	"application/eat-bun+cbor": {
	source: "iana"
},
	"application/eat-bun+json": {
	source: "iana",
	compressible: true
},
	"application/eat-ucs+cbor": {
	source: "iana"
},
	"application/eat-ucs+json": {
	source: "iana",
	compressible: true
},
	"application/ecmascript": {
	source: "apache",
	compressible: true,
	extensions: [
		"ecma"
	]
},
	"application/edhoc+cbor-seq": {
	source: "iana"
},
	"application/edi-consent": {
	source: "iana"
},
	"application/edi-x12": {
	source: "iana",
	compressible: false
},
	"application/edifact": {
	source: "iana",
	compressible: false
},
	"application/efi": {
	source: "iana"
},
	"application/elm+json": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/elm+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.cap+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/emergencycalldata.comment+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.control+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.deviceinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.ecall.msd": {
	source: "iana"
},
	"application/emergencycalldata.legacyesn+json": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.providerinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.serviceinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.subscriberinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/emergencycalldata.veds+xml": {
	source: "iana",
	compressible: true
},
	"application/emma+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"emma"
	]
},
	"application/emotionml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"emotionml"
	]
},
	"application/encaprtp": {
	source: "iana"
},
	"application/entity-statement+jwt": {
	source: "iana"
},
	"application/epp+xml": {
	source: "iana",
	compressible: true
},
	"application/epub+zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"epub"
	]
},
	"application/eshop": {
	source: "iana"
},
	"application/exi": {
	source: "iana",
	extensions: [
		"exi"
	]
},
	"application/expect-ct-report+json": {
	source: "iana",
	compressible: true
},
	"application/express": {
	source: "iana",
	extensions: [
		"exp"
	]
},
	"application/fastinfoset": {
	source: "iana"
},
	"application/fastsoap": {
	source: "iana"
},
	"application/fdf": {
	source: "iana",
	extensions: [
		"fdf"
	]
},
	"application/fdt+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"fdt"
	]
},
	"application/fhir+json": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/fhir+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/fido.trusted-apps+json": {
	compressible: true
},
	"application/fits": {
	source: "iana"
},
	"application/flexfec": {
	source: "iana"
},
	"application/font-sfnt": {
	source: "iana"
},
	"application/font-tdpfr": {
	source: "iana",
	extensions: [
		"pfr"
	]
},
	"application/font-woff": {
	source: "iana",
	compressible: false
},
	"application/framework-attributes+xml": {
	source: "iana",
	compressible: true
},
	"application/geo+json": {
	source: "iana",
	compressible: true,
	extensions: [
		"geojson"
	]
},
	"application/geo+json-seq": {
	source: "iana"
},
	"application/geopackage+sqlite3": {
	source: "iana"
},
	"application/geopose+json": {
	source: "iana",
	compressible: true
},
	"application/geoxacml+json": {
	source: "iana",
	compressible: true
},
	"application/geoxacml+xml": {
	source: "iana",
	compressible: true
},
	"application/gltf-buffer": {
	source: "iana"
},
	"application/gml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"gml"
	]
},
	"application/gnap-binding-jws": {
	source: "iana"
},
	"application/gnap-binding-jwsd": {
	source: "iana"
},
	"application/gnap-binding-rotation-jws": {
	source: "iana"
},
	"application/gnap-binding-rotation-jwsd": {
	source: "iana"
},
	"application/gpx+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"gpx"
	]
},
	"application/grib": {
	source: "iana"
},
	"application/gxf": {
	source: "apache",
	extensions: [
		"gxf"
	]
},
	"application/gzip": {
	source: "iana",
	compressible: false,
	extensions: [
		"gz"
	]
},
	"application/h224": {
	source: "iana"
},
	"application/held+xml": {
	source: "iana",
	compressible: true
},
	"application/hjson": {
	extensions: [
		"hjson"
	]
},
	"application/hl7v2+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/http": {
	source: "iana"
},
	"application/hyperstudio": {
	source: "iana",
	extensions: [
		"stk"
	]
},
	"application/ibe-key-request+xml": {
	source: "iana",
	compressible: true
},
	"application/ibe-pkg-reply+xml": {
	source: "iana",
	compressible: true
},
	"application/ibe-pp-data": {
	source: "iana"
},
	"application/iges": {
	source: "iana"
},
	"application/im-iscomposing+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/index": {
	source: "iana"
},
	"application/index.cmd": {
	source: "iana"
},
	"application/index.obj": {
	source: "iana"
},
	"application/index.response": {
	source: "iana"
},
	"application/index.vnd": {
	source: "iana"
},
	"application/inkml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"ink",
		"inkml"
	]
},
	"application/iotp": {
	source: "iana"
},
	"application/ipfix": {
	source: "iana",
	extensions: [
		"ipfix"
	]
},
	"application/ipp": {
	source: "iana"
},
	"application/isup": {
	source: "iana"
},
	"application/its+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"its"
	]
},
	"application/java-archive": {
	source: "iana",
	compressible: false,
	extensions: [
		"jar",
		"war",
		"ear"
	]
},
	"application/java-serialized-object": {
	source: "apache",
	compressible: false,
	extensions: [
		"ser"
	]
},
	"application/java-vm": {
	source: "apache",
	compressible: false,
	extensions: [
		"class"
	]
},
	"application/javascript": {
	source: "apache",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"js"
	]
},
	"application/jf2feed+json": {
	source: "iana",
	compressible: true
},
	"application/jose": {
	source: "iana"
},
	"application/jose+json": {
	source: "iana",
	compressible: true
},
	"application/jrd+json": {
	source: "iana",
	compressible: true
},
	"application/jscalendar+json": {
	source: "iana",
	compressible: true
},
	"application/jscontact+json": {
	source: "iana",
	compressible: true
},
	"application/json": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"json",
		"map"
	]
},
	"application/json-patch+json": {
	source: "iana",
	compressible: true
},
	"application/json-seq": {
	source: "iana"
},
	"application/json5": {
	extensions: [
		"json5"
	]
},
	"application/jsonml+json": {
	source: "apache",
	compressible: true,
	extensions: [
		"jsonml"
	]
},
	"application/jsonpath": {
	source: "iana"
},
	"application/jwk+json": {
	source: "iana",
	compressible: true
},
	"application/jwk-set+json": {
	source: "iana",
	compressible: true
},
	"application/jwk-set+jwt": {
	source: "iana"
},
	"application/jwt": {
	source: "iana"
},
	"application/kpml-request+xml": {
	source: "iana",
	compressible: true
},
	"application/kpml-response+xml": {
	source: "iana",
	compressible: true
},
	"application/ld+json": {
	source: "iana",
	compressible: true,
	extensions: [
		"jsonld"
	]
},
	"application/lgr+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"lgr"
	]
},
	"application/link-format": {
	source: "iana"
},
	"application/linkset": {
	source: "iana"
},
	"application/linkset+json": {
	source: "iana",
	compressible: true
},
	"application/load-control+xml": {
	source: "iana",
	compressible: true
},
	"application/logout+jwt": {
	source: "iana"
},
	"application/lost+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"lostxml"
	]
},
	"application/lostsync+xml": {
	source: "iana",
	compressible: true
},
	"application/lpf+zip": {
	source: "iana",
	compressible: false
},
	"application/lxf": {
	source: "iana"
},
	"application/mac-binhex40": {
	source: "iana",
	extensions: [
		"hqx"
	]
},
	"application/mac-compactpro": {
	source: "apache",
	extensions: [
		"cpt"
	]
},
	"application/macwriteii": {
	source: "iana"
},
	"application/mads+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mads"
	]
},
	"application/manifest+json": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"webmanifest"
	]
},
	"application/marc": {
	source: "iana",
	extensions: [
		"mrc"
	]
},
	"application/marcxml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mrcx"
	]
},
	"application/mathematica": {
	source: "iana",
	extensions: [
		"ma",
		"nb",
		"mb"
	]
},
	"application/mathml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mathml"
	]
},
	"application/mathml-content+xml": {
	source: "iana",
	compressible: true
},
	"application/mathml-presentation+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-associated-procedure-description+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-deregister+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-envelope+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-msk+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-msk-response+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-protection-description+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-reception-report+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-register+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-register-response+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-schedule+xml": {
	source: "iana",
	compressible: true
},
	"application/mbms-user-service-description+xml": {
	source: "iana",
	compressible: true
},
	"application/mbox": {
	source: "iana",
	extensions: [
		"mbox"
	]
},
	"application/media-policy-dataset+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mpf"
	]
},
	"application/media_control+xml": {
	source: "iana",
	compressible: true
},
	"application/mediaservercontrol+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mscml"
	]
},
	"application/merge-patch+json": {
	source: "iana",
	compressible: true
},
	"application/metalink+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"metalink"
	]
},
	"application/metalink4+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"meta4"
	]
},
	"application/mets+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mets"
	]
},
	"application/mf4": {
	source: "iana"
},
	"application/mikey": {
	source: "iana"
},
	"application/mipc": {
	source: "iana"
},
	"application/missing-blocks+cbor-seq": {
	source: "iana"
},
	"application/mmt-aei+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"maei"
	]
},
	"application/mmt-usd+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"musd"
	]
},
	"application/mods+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mods"
	]
},
	"application/moss-keys": {
	source: "iana"
},
	"application/moss-signature": {
	source: "iana"
},
	"application/mosskey-data": {
	source: "iana"
},
	"application/mosskey-request": {
	source: "iana"
},
	"application/mp21": {
	source: "iana",
	extensions: [
		"m21",
		"mp21"
	]
},
	"application/mp4": {
	source: "iana",
	extensions: [
		"mp4",
		"mpg4",
		"mp4s",
		"m4p"
	]
},
	"application/mpeg4-generic": {
	source: "iana"
},
	"application/mpeg4-iod": {
	source: "iana"
},
	"application/mpeg4-iod-xmt": {
	source: "iana"
},
	"application/mrb-consumer+xml": {
	source: "iana",
	compressible: true
},
	"application/mrb-publish+xml": {
	source: "iana",
	compressible: true
},
	"application/msc-ivr+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/msc-mixer+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/msix": {
	compressible: false,
	extensions: [
		"msix"
	]
},
	"application/msixbundle": {
	compressible: false,
	extensions: [
		"msixbundle"
	]
},
	"application/msword": {
	source: "iana",
	compressible: false,
	extensions: [
		"doc",
		"dot"
	]
},
	"application/mud+json": {
	source: "iana",
	compressible: true
},
	"application/multipart-core": {
	source: "iana"
},
	"application/mxf": {
	source: "iana",
	extensions: [
		"mxf"
	]
},
	"application/n-quads": {
	source: "iana",
	extensions: [
		"nq"
	]
},
	"application/n-triples": {
	source: "iana",
	extensions: [
		"nt"
	]
},
	"application/nasdata": {
	source: "iana"
},
	"application/news-checkgroups": {
	source: "iana",
	charset: "US-ASCII"
},
	"application/news-groupinfo": {
	source: "iana",
	charset: "US-ASCII"
},
	"application/news-transmission": {
	source: "iana"
},
	"application/nlsml+xml": {
	source: "iana",
	compressible: true
},
	"application/node": {
	source: "iana",
	extensions: [
		"cjs"
	]
},
	"application/nss": {
	source: "iana"
},
	"application/oauth-authz-req+jwt": {
	source: "iana"
},
	"application/oblivious-dns-message": {
	source: "iana"
},
	"application/ocsp-request": {
	source: "iana"
},
	"application/ocsp-response": {
	source: "iana"
},
	"application/octet-stream": {
	source: "iana",
	compressible: true,
	extensions: [
		"bin",
		"dms",
		"lrf",
		"mar",
		"so",
		"dist",
		"distz",
		"pkg",
		"bpk",
		"dump",
		"elc",
		"deploy",
		"exe",
		"dll",
		"deb",
		"dmg",
		"iso",
		"img",
		"msi",
		"msp",
		"msm",
		"buffer"
	]
},
	"application/oda": {
	source: "iana",
	extensions: [
		"oda"
	]
},
	"application/odm+xml": {
	source: "iana",
	compressible: true
},
	"application/odx": {
	source: "iana"
},
	"application/oebps-package+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"opf"
	]
},
	"application/ogg": {
	source: "iana",
	compressible: false,
	extensions: [
		"ogx"
	]
},
	"application/ohttp-keys": {
	source: "iana"
},
	"application/omdoc+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"omdoc"
	]
},
	"application/onenote": {
	source: "apache",
	extensions: [
		"onetoc",
		"onetoc2",
		"onetmp",
		"onepkg",
		"one",
		"onea"
	]
},
	"application/opc-nodeset+xml": {
	source: "iana",
	compressible: true
},
	"application/oscore": {
	source: "iana"
},
	"application/oxps": {
	source: "iana",
	extensions: [
		"oxps"
	]
},
	"application/p21": {
	source: "iana"
},
	"application/p21+zip": {
	source: "iana",
	compressible: false
},
	"application/p2p-overlay+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"relo"
	]
},
	"application/parityfec": {
	source: "iana"
},
	"application/passport": {
	source: "iana"
},
	"application/patch-ops-error+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xer"
	]
},
	"application/pdf": {
	source: "iana",
	compressible: false,
	extensions: [
		"pdf"
	]
},
	"application/pdx": {
	source: "iana"
},
	"application/pem-certificate-chain": {
	source: "iana"
},
	"application/pgp-encrypted": {
	source: "iana",
	compressible: false,
	extensions: [
		"pgp"
	]
},
	"application/pgp-keys": {
	source: "iana",
	extensions: [
		"asc"
	]
},
	"application/pgp-signature": {
	source: "iana",
	extensions: [
		"sig",
		"asc"
	]
},
	"application/pics-rules": {
	source: "apache",
	extensions: [
		"prf"
	]
},
	"application/pidf+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/pidf-diff+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/pkcs10": {
	source: "iana",
	extensions: [
		"p10"
	]
},
	"application/pkcs12": {
	source: "iana"
},
	"application/pkcs7-mime": {
	source: "iana",
	extensions: [
		"p7m",
		"p7c"
	]
},
	"application/pkcs7-signature": {
	source: "iana",
	extensions: [
		"p7s"
	]
},
	"application/pkcs8": {
	source: "iana",
	extensions: [
		"p8"
	]
},
	"application/pkcs8-encrypted": {
	source: "iana"
},
	"application/pkix-attr-cert": {
	source: "iana",
	extensions: [
		"ac"
	]
},
	"application/pkix-cert": {
	source: "iana",
	extensions: [
		"cer"
	]
},
	"application/pkix-crl": {
	source: "iana",
	extensions: [
		"crl"
	]
},
	"application/pkix-pkipath": {
	source: "iana",
	extensions: [
		"pkipath"
	]
},
	"application/pkixcmp": {
	source: "iana",
	extensions: [
		"pki"
	]
},
	"application/pls+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"pls"
	]
},
	"application/poc-settings+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/postscript": {
	source: "iana",
	compressible: true,
	extensions: [
		"ai",
		"eps",
		"ps"
	]
},
	"application/ppsp-tracker+json": {
	source: "iana",
	compressible: true
},
	"application/private-token-issuer-directory": {
	source: "iana"
},
	"application/private-token-request": {
	source: "iana"
},
	"application/private-token-response": {
	source: "iana"
},
	"application/problem+json": {
	source: "iana",
	compressible: true
},
	"application/problem+xml": {
	source: "iana",
	compressible: true
},
	"application/provenance+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"provx"
	]
},
	"application/provided-claims+jwt": {
	source: "iana"
},
	"application/prs.alvestrand.titrax-sheet": {
	source: "iana"
},
	"application/prs.cww": {
	source: "iana",
	extensions: [
		"cww"
	]
},
	"application/prs.cyn": {
	source: "iana",
	charset: "7-BIT"
},
	"application/prs.hpub+zip": {
	source: "iana",
	compressible: false
},
	"application/prs.implied-document+xml": {
	source: "iana",
	compressible: true
},
	"application/prs.implied-executable": {
	source: "iana"
},
	"application/prs.implied-object+json": {
	source: "iana",
	compressible: true
},
	"application/prs.implied-object+json-seq": {
	source: "iana"
},
	"application/prs.implied-object+yaml": {
	source: "iana"
},
	"application/prs.implied-structure": {
	source: "iana"
},
	"application/prs.mayfile": {
	source: "iana"
},
	"application/prs.nprend": {
	source: "iana"
},
	"application/prs.plucker": {
	source: "iana"
},
	"application/prs.rdf-xml-crypt": {
	source: "iana"
},
	"application/prs.vcfbzip2": {
	source: "iana"
},
	"application/prs.xsf+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xsf"
	]
},
	"application/pskc+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"pskcxml"
	]
},
	"application/pvd+json": {
	source: "iana",
	compressible: true
},
	"application/qsig": {
	source: "iana"
},
	"application/raml+yaml": {
	compressible: true,
	extensions: [
		"raml"
	]
},
	"application/raptorfec": {
	source: "iana"
},
	"application/rdap+json": {
	source: "iana",
	compressible: true
},
	"application/rdf+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rdf",
		"owl"
	]
},
	"application/reginfo+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rif"
	]
},
	"application/relax-ng-compact-syntax": {
	source: "iana",
	extensions: [
		"rnc"
	]
},
	"application/remote-printing": {
	source: "apache"
},
	"application/reputon+json": {
	source: "iana",
	compressible: true
},
	"application/resolve-response+jwt": {
	source: "iana"
},
	"application/resource-lists+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rl"
	]
},
	"application/resource-lists-diff+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rld"
	]
},
	"application/rfc+xml": {
	source: "iana",
	compressible: true
},
	"application/riscos": {
	source: "iana"
},
	"application/rlmi+xml": {
	source: "iana",
	compressible: true
},
	"application/rls-services+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rs"
	]
},
	"application/route-apd+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rapd"
	]
},
	"application/route-s-tsid+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"sls"
	]
},
	"application/route-usd+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rusd"
	]
},
	"application/rpki-checklist": {
	source: "iana"
},
	"application/rpki-ghostbusters": {
	source: "iana",
	extensions: [
		"gbr"
	]
},
	"application/rpki-manifest": {
	source: "iana",
	extensions: [
		"mft"
	]
},
	"application/rpki-publication": {
	source: "iana"
},
	"application/rpki-roa": {
	source: "iana",
	extensions: [
		"roa"
	]
},
	"application/rpki-signed-tal": {
	source: "iana"
},
	"application/rpki-updown": {
	source: "iana"
},
	"application/rsd+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"rsd"
	]
},
	"application/rss+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"rss"
	]
},
	"application/rtf": {
	source: "iana",
	compressible: true,
	extensions: [
		"rtf"
	]
},
	"application/rtploopback": {
	source: "iana"
},
	"application/rtx": {
	source: "iana"
},
	"application/samlassertion+xml": {
	source: "iana",
	compressible: true
},
	"application/samlmetadata+xml": {
	source: "iana",
	compressible: true
},
	"application/sarif+json": {
	source: "iana",
	compressible: true
},
	"application/sarif-external-properties+json": {
	source: "iana",
	compressible: true
},
	"application/sbe": {
	source: "iana"
},
	"application/sbml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"sbml"
	]
},
	"application/scaip+xml": {
	source: "iana",
	compressible: true
},
	"application/scim+json": {
	source: "iana",
	compressible: true
},
	"application/scvp-cv-request": {
	source: "iana",
	extensions: [
		"scq"
	]
},
	"application/scvp-cv-response": {
	source: "iana",
	extensions: [
		"scs"
	]
},
	"application/scvp-vp-request": {
	source: "iana",
	extensions: [
		"spq"
	]
},
	"application/scvp-vp-response": {
	source: "iana",
	extensions: [
		"spp"
	]
},
	"application/sdp": {
	source: "iana",
	extensions: [
		"sdp"
	]
},
	"application/secevent+jwt": {
	source: "iana"
},
	"application/senml+cbor": {
	source: "iana"
},
	"application/senml+json": {
	source: "iana",
	compressible: true
},
	"application/senml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"senmlx"
	]
},
	"application/senml-etch+cbor": {
	source: "iana"
},
	"application/senml-etch+json": {
	source: "iana",
	compressible: true
},
	"application/senml-exi": {
	source: "iana"
},
	"application/sensml+cbor": {
	source: "iana"
},
	"application/sensml+json": {
	source: "iana",
	compressible: true
},
	"application/sensml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"sensmlx"
	]
},
	"application/sensml-exi": {
	source: "iana"
},
	"application/sep+xml": {
	source: "iana",
	compressible: true
},
	"application/sep-exi": {
	source: "iana"
},
	"application/session-info": {
	source: "iana"
},
	"application/set-payment": {
	source: "iana"
},
	"application/set-payment-initiation": {
	source: "iana",
	extensions: [
		"setpay"
	]
},
	"application/set-registration": {
	source: "iana"
},
	"application/set-registration-initiation": {
	source: "iana",
	extensions: [
		"setreg"
	]
},
	"application/sgml": {
	source: "iana"
},
	"application/sgml-open-catalog": {
	source: "iana"
},
	"application/shf+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"shf"
	]
},
	"application/sieve": {
	source: "iana",
	extensions: [
		"siv",
		"sieve"
	]
},
	"application/simple-filter+xml": {
	source: "iana",
	compressible: true
},
	"application/simple-message-summary": {
	source: "iana"
},
	"application/simplesymbolcontainer": {
	source: "iana"
},
	"application/sipc": {
	source: "iana"
},
	"application/slate": {
	source: "iana"
},
	"application/smil": {
	source: "apache"
},
	"application/smil+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"smi",
		"smil"
	]
},
	"application/smpte336m": {
	source: "iana"
},
	"application/soap+fastinfoset": {
	source: "iana"
},
	"application/soap+xml": {
	source: "iana",
	compressible: true
},
	"application/sparql-query": {
	source: "iana",
	extensions: [
		"rq"
	]
},
	"application/sparql-results+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"srx"
	]
},
	"application/spdx+json": {
	source: "iana",
	compressible: true
},
	"application/spirits-event+xml": {
	source: "iana",
	compressible: true
},
	"application/sql": {
	source: "iana",
	extensions: [
		"sql"
	]
},
	"application/srgs": {
	source: "iana",
	extensions: [
		"gram"
	]
},
	"application/srgs+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"grxml"
	]
},
	"application/sru+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"sru"
	]
},
	"application/ssdl+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"ssdl"
	]
},
	"application/sslkeylogfile": {
	source: "iana"
},
	"application/ssml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"ssml"
	]
},
	"application/st2110-41": {
	source: "iana"
},
	"application/stix+json": {
	source: "iana",
	compressible: true
},
	"application/stratum": {
	source: "iana"
},
	"application/swid+cbor": {
	source: "iana"
},
	"application/swid+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"swidtag"
	]
},
	"application/tamp-apex-update": {
	source: "iana"
},
	"application/tamp-apex-update-confirm": {
	source: "iana"
},
	"application/tamp-community-update": {
	source: "iana"
},
	"application/tamp-community-update-confirm": {
	source: "iana"
},
	"application/tamp-error": {
	source: "iana"
},
	"application/tamp-sequence-adjust": {
	source: "iana"
},
	"application/tamp-sequence-adjust-confirm": {
	source: "iana"
},
	"application/tamp-status-query": {
	source: "iana"
},
	"application/tamp-status-response": {
	source: "iana"
},
	"application/tamp-update": {
	source: "iana"
},
	"application/tamp-update-confirm": {
	source: "iana"
},
	"application/tar": {
	compressible: true
},
	"application/taxii+json": {
	source: "iana",
	compressible: true
},
	"application/td+json": {
	source: "iana",
	compressible: true
},
	"application/tei+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"tei",
		"teicorpus"
	]
},
	"application/tetra_isi": {
	source: "iana"
},
	"application/thraud+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"tfi"
	]
},
	"application/timestamp-query": {
	source: "iana"
},
	"application/timestamp-reply": {
	source: "iana"
},
	"application/timestamped-data": {
	source: "iana",
	extensions: [
		"tsd"
	]
},
	"application/tlsrpt+gzip": {
	source: "iana"
},
	"application/tlsrpt+json": {
	source: "iana",
	compressible: true
},
	"application/tm+json": {
	source: "iana",
	compressible: true
},
	"application/tnauthlist": {
	source: "iana"
},
	"application/toc+cbor": {
	source: "iana"
},
	"application/token-introspection+jwt": {
	source: "iana"
},
	"application/toml": {
	source: "iana",
	compressible: true,
	extensions: [
		"toml"
	]
},
	"application/trickle-ice-sdpfrag": {
	source: "iana"
},
	"application/trig": {
	source: "iana",
	extensions: [
		"trig"
	]
},
	"application/trust-chain+json": {
	source: "iana",
	compressible: true
},
	"application/trust-mark+jwt": {
	source: "iana"
},
	"application/trust-mark-delegation+jwt": {
	source: "iana"
},
	"application/ttml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"ttml"
	]
},
	"application/tve-trigger": {
	source: "iana"
},
	"application/tzif": {
	source: "iana"
},
	"application/tzif-leap": {
	source: "iana"
},
	"application/ubjson": {
	compressible: false,
	extensions: [
		"ubj"
	]
},
	"application/uccs+cbor": {
	source: "iana"
},
	"application/ujcs+json": {
	source: "iana",
	compressible: true
},
	"application/ulpfec": {
	source: "iana"
},
	"application/urc-grpsheet+xml": {
	source: "iana",
	compressible: true
},
	"application/urc-ressheet+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"rsheet"
	]
},
	"application/urc-targetdesc+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"td"
	]
},
	"application/urc-uisocketdesc+xml": {
	source: "iana",
	compressible: true
},
	"application/vc": {
	source: "iana"
},
	"application/vc+cose": {
	source: "iana"
},
	"application/vc+jwt": {
	source: "iana"
},
	"application/vcard+json": {
	source: "iana",
	compressible: true
},
	"application/vcard+xml": {
	source: "iana",
	compressible: true
},
	"application/vemmi": {
	source: "iana"
},
	"application/vividence.scriptfile": {
	source: "apache"
},
	"application/vnd.1000minds.decision-model+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"1km"
	]
},
	"application/vnd.1ob": {
	source: "iana"
},
	"application/vnd.3gpp-prose+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp-prose-pc3a+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp-prose-pc3ach+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp-prose-pc3ch+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp-prose-pc8+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp-v2x-local-service-information": {
	source: "iana"
},
	"application/vnd.3gpp.5gnas": {
	source: "iana"
},
	"application/vnd.3gpp.5gsa2x": {
	source: "iana"
},
	"application/vnd.3gpp.5gsa2x-local-service-information": {
	source: "iana"
},
	"application/vnd.3gpp.5gsv2x": {
	source: "iana"
},
	"application/vnd.3gpp.5gsv2x-local-service-information": {
	source: "iana"
},
	"application/vnd.3gpp.access-transfer-events+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.bsf+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.crs+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.current-location-discovery+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.gmop+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.gtpc": {
	source: "iana"
},
	"application/vnd.3gpp.interworking-data": {
	source: "iana"
},
	"application/vnd.3gpp.lpp": {
	source: "iana"
},
	"application/vnd.3gpp.mc-signalling-ear": {
	source: "iana"
},
	"application/vnd.3gpp.mcdata-affiliation-command+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-msgstore-ctrl-request+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-payload": {
	source: "iana"
},
	"application/vnd.3gpp.mcdata-regroup+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-service-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-signalling": {
	source: "iana"
},
	"application/vnd.3gpp.mcdata-ue-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcdata-user-profile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-affiliation-command+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-floor-request+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-location-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-regroup+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-service-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-signed+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-ue-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-ue-init-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcptt-user-profile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-affiliation-command+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-location-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-regroup+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-service-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-transmission-request+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-ue-config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mcvideo-user-profile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.mid-call+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.ngap": {
	source: "iana"
},
	"application/vnd.3gpp.pfcp": {
	source: "iana"
},
	"application/vnd.3gpp.pic-bw-large": {
	source: "iana",
	extensions: [
		"plb"
	]
},
	"application/vnd.3gpp.pic-bw-small": {
	source: "iana",
	extensions: [
		"psb"
	]
},
	"application/vnd.3gpp.pic-bw-var": {
	source: "iana",
	extensions: [
		"pvb"
	]
},
	"application/vnd.3gpp.pinapp-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.s1ap": {
	source: "iana"
},
	"application/vnd.3gpp.seal-group-doc+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-location-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-mbms-usage-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-network-qos-management-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-ue-config-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-unicast-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.seal-user-profile-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.sms": {
	source: "iana"
},
	"application/vnd.3gpp.sms+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.srvcc-ext+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.srvcc-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.state-and-event-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.ussd+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp.v2x": {
	source: "iana"
},
	"application/vnd.3gpp.vae-info+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp2.bcmcsinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.3gpp2.sms": {
	source: "iana"
},
	"application/vnd.3gpp2.tcap": {
	source: "iana",
	extensions: [
		"tcap"
	]
},
	"application/vnd.3lightssoftware.imagescal": {
	source: "iana"
},
	"application/vnd.3m.post-it-notes": {
	source: "iana",
	extensions: [
		"pwn"
	]
},
	"application/vnd.accpac.simply.aso": {
	source: "iana",
	extensions: [
		"aso"
	]
},
	"application/vnd.accpac.simply.imp": {
	source: "iana",
	extensions: [
		"imp"
	]
},
	"application/vnd.acm.addressxfer+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.acm.chatbot+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.acucobol": {
	source: "iana",
	extensions: [
		"acu"
	]
},
	"application/vnd.acucorp": {
	source: "iana",
	extensions: [
		"atc",
		"acutc"
	]
},
	"application/vnd.adobe.air-application-installer-package+zip": {
	source: "apache",
	compressible: false,
	extensions: [
		"air"
	]
},
	"application/vnd.adobe.flash.movie": {
	source: "iana"
},
	"application/vnd.adobe.formscentral.fcdt": {
	source: "iana",
	extensions: [
		"fcdt"
	]
},
	"application/vnd.adobe.fxp": {
	source: "iana",
	extensions: [
		"fxp",
		"fxpl"
	]
},
	"application/vnd.adobe.partial-upload": {
	source: "iana"
},
	"application/vnd.adobe.xdp+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xdp"
	]
},
	"application/vnd.adobe.xfdf": {
	source: "apache",
	extensions: [
		"xfdf"
	]
},
	"application/vnd.aether.imp": {
	source: "iana"
},
	"application/vnd.afpc.afplinedata": {
	source: "iana"
},
	"application/vnd.afpc.afplinedata-pagedef": {
	source: "iana"
},
	"application/vnd.afpc.cmoca-cmresource": {
	source: "iana"
},
	"application/vnd.afpc.foca-charset": {
	source: "iana"
},
	"application/vnd.afpc.foca-codedfont": {
	source: "iana"
},
	"application/vnd.afpc.foca-codepage": {
	source: "iana"
},
	"application/vnd.afpc.modca": {
	source: "iana"
},
	"application/vnd.afpc.modca-cmtable": {
	source: "iana"
},
	"application/vnd.afpc.modca-formdef": {
	source: "iana"
},
	"application/vnd.afpc.modca-mediummap": {
	source: "iana"
},
	"application/vnd.afpc.modca-objectcontainer": {
	source: "iana"
},
	"application/vnd.afpc.modca-overlay": {
	source: "iana"
},
	"application/vnd.afpc.modca-pagesegment": {
	source: "iana"
},
	"application/vnd.age": {
	source: "iana",
	extensions: [
		"age"
	]
},
	"application/vnd.ah-barcode": {
	source: "apache"
},
	"application/vnd.ahead.space": {
	source: "iana",
	extensions: [
		"ahead"
	]
},
	"application/vnd.airzip.filesecure.azf": {
	source: "iana",
	extensions: [
		"azf"
	]
},
	"application/vnd.airzip.filesecure.azs": {
	source: "iana",
	extensions: [
		"azs"
	]
},
	"application/vnd.amadeus+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.amazon.ebook": {
	source: "apache",
	extensions: [
		"azw"
	]
},
	"application/vnd.amazon.mobi8-ebook": {
	source: "iana"
},
	"application/vnd.americandynamics.acc": {
	source: "iana",
	extensions: [
		"acc"
	]
},
	"application/vnd.amiga.ami": {
	source: "iana",
	extensions: [
		"ami"
	]
},
	"application/vnd.amundsen.maze+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.android.ota": {
	source: "iana"
},
	"application/vnd.android.package-archive": {
	source: "apache",
	compressible: false,
	extensions: [
		"apk"
	]
},
	"application/vnd.anki": {
	source: "iana"
},
	"application/vnd.anser-web-certificate-issue-initiation": {
	source: "iana",
	extensions: [
		"cii"
	]
},
	"application/vnd.anser-web-funds-transfer-initiation": {
	source: "apache",
	extensions: [
		"fti"
	]
},
	"application/vnd.antix.game-component": {
	source: "iana",
	extensions: [
		"atx"
	]
},
	"application/vnd.apache.arrow.file": {
	source: "iana"
},
	"application/vnd.apache.arrow.stream": {
	source: "iana"
},
	"application/vnd.apache.parquet": {
	source: "iana"
},
	"application/vnd.apache.thrift.binary": {
	source: "iana"
},
	"application/vnd.apache.thrift.compact": {
	source: "iana"
},
	"application/vnd.apache.thrift.json": {
	source: "iana"
},
	"application/vnd.apexlang": {
	source: "iana"
},
	"application/vnd.api+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.aplextor.warrp+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.apothekende.reservation+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.apple.installer+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mpkg"
	]
},
	"application/vnd.apple.keynote": {
	source: "iana",
	extensions: [
		"key"
	]
},
	"application/vnd.apple.mpegurl": {
	source: "iana",
	extensions: [
		"m3u8"
	]
},
	"application/vnd.apple.numbers": {
	source: "iana",
	extensions: [
		"numbers"
	]
},
	"application/vnd.apple.pages": {
	source: "iana",
	extensions: [
		"pages"
	]
},
	"application/vnd.apple.pkpass": {
	compressible: false,
	extensions: [
		"pkpass"
	]
},
	"application/vnd.arastra.swi": {
	source: "apache"
},
	"application/vnd.aristanetworks.swi": {
	source: "iana",
	extensions: [
		"swi"
	]
},
	"application/vnd.artisan+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.artsquare": {
	source: "iana"
},
	"application/vnd.astraea-software.iota": {
	source: "iana",
	extensions: [
		"iota"
	]
},
	"application/vnd.audiograph": {
	source: "iana",
	extensions: [
		"aep"
	]
},
	"application/vnd.autodesk.fbx": {
	extensions: [
		"fbx"
	]
},
	"application/vnd.autopackage": {
	source: "iana"
},
	"application/vnd.avalon+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.avistar+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.balsamiq.bmml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"bmml"
	]
},
	"application/vnd.balsamiq.bmpr": {
	source: "iana"
},
	"application/vnd.banana-accounting": {
	source: "iana"
},
	"application/vnd.bbf.usp.error": {
	source: "iana"
},
	"application/vnd.bbf.usp.msg": {
	source: "iana"
},
	"application/vnd.bbf.usp.msg+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.bekitzur-stech+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.belightsoft.lhzd+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.belightsoft.lhzl+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.bint.med-content": {
	source: "iana"
},
	"application/vnd.biopax.rdf+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.blink-idb-value-wrapper": {
	source: "iana"
},
	"application/vnd.blueice.multipass": {
	source: "iana",
	extensions: [
		"mpm"
	]
},
	"application/vnd.bluetooth.ep.oob": {
	source: "iana"
},
	"application/vnd.bluetooth.le.oob": {
	source: "iana"
},
	"application/vnd.bmi": {
	source: "iana",
	extensions: [
		"bmi"
	]
},
	"application/vnd.bpf": {
	source: "iana"
},
	"application/vnd.bpf3": {
	source: "iana"
},
	"application/vnd.businessobjects": {
	source: "iana",
	extensions: [
		"rep"
	]
},
	"application/vnd.byu.uapi+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.bzip3": {
	source: "iana"
},
	"application/vnd.c3voc.schedule+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.cab-jscript": {
	source: "iana"
},
	"application/vnd.canon-cpdl": {
	source: "iana"
},
	"application/vnd.canon-lips": {
	source: "iana"
},
	"application/vnd.capasystems-pg+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.cendio.thinlinc.clientconf": {
	source: "iana"
},
	"application/vnd.century-systems.tcp_stream": {
	source: "iana"
},
	"application/vnd.chemdraw+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"cdxml"
	]
},
	"application/vnd.chess-pgn": {
	source: "iana"
},
	"application/vnd.chipnuts.karaoke-mmd": {
	source: "iana",
	extensions: [
		"mmd"
	]
},
	"application/vnd.ciedi": {
	source: "iana"
},
	"application/vnd.cinderella": {
	source: "iana",
	extensions: [
		"cdy"
	]
},
	"application/vnd.cirpack.isdn-ext": {
	source: "iana"
},
	"application/vnd.citationstyles.style+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"csl"
	]
},
	"application/vnd.claymore": {
	source: "iana",
	extensions: [
		"cla"
	]
},
	"application/vnd.cloanto.rp9": {
	source: "iana",
	extensions: [
		"rp9"
	]
},
	"application/vnd.clonk.c4group": {
	source: "iana",
	extensions: [
		"c4g",
		"c4d",
		"c4f",
		"c4p",
		"c4u"
	]
},
	"application/vnd.cluetrust.cartomobile-config": {
	source: "iana",
	extensions: [
		"c11amc"
	]
},
	"application/vnd.cluetrust.cartomobile-config-pkg": {
	source: "iana",
	extensions: [
		"c11amz"
	]
},
	"application/vnd.cncf.helm.chart.content.v1.tar+gzip": {
	source: "iana"
},
	"application/vnd.cncf.helm.chart.provenance.v1.prov": {
	source: "iana"
},
	"application/vnd.cncf.helm.config.v1+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.coffeescript": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.document": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.document-template": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.presentation": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.presentation-template": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.spreadsheet": {
	source: "iana"
},
	"application/vnd.collabio.xodocuments.spreadsheet-template": {
	source: "iana"
},
	"application/vnd.collection+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.collection.doc+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.collection.next+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.comicbook+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.comicbook-rar": {
	source: "iana"
},
	"application/vnd.commerce-battelle": {
	source: "iana"
},
	"application/vnd.commonspace": {
	source: "iana",
	extensions: [
		"csp"
	]
},
	"application/vnd.contact.cmsg": {
	source: "iana",
	extensions: [
		"cdbcmsg"
	]
},
	"application/vnd.coreos.ignition+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.cosmocaller": {
	source: "iana",
	extensions: [
		"cmc"
	]
},
	"application/vnd.crick.clicker": {
	source: "iana",
	extensions: [
		"clkx"
	]
},
	"application/vnd.crick.clicker.keyboard": {
	source: "iana",
	extensions: [
		"clkk"
	]
},
	"application/vnd.crick.clicker.palette": {
	source: "iana",
	extensions: [
		"clkp"
	]
},
	"application/vnd.crick.clicker.template": {
	source: "iana",
	extensions: [
		"clkt"
	]
},
	"application/vnd.crick.clicker.wordbank": {
	source: "iana",
	extensions: [
		"clkw"
	]
},
	"application/vnd.criticaltools.wbs+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"wbs"
	]
},
	"application/vnd.cryptii.pipe+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.crypto-shade-file": {
	source: "iana"
},
	"application/vnd.cryptomator.encrypted": {
	source: "iana"
},
	"application/vnd.cryptomator.vault": {
	source: "iana"
},
	"application/vnd.ctc-posml": {
	source: "iana",
	extensions: [
		"pml"
	]
},
	"application/vnd.ctct.ws+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.cups-pdf": {
	source: "iana"
},
	"application/vnd.cups-postscript": {
	source: "iana"
},
	"application/vnd.cups-ppd": {
	source: "iana",
	extensions: [
		"ppd"
	]
},
	"application/vnd.cups-raster": {
	source: "iana"
},
	"application/vnd.cups-raw": {
	source: "iana"
},
	"application/vnd.curl": {
	source: "iana"
},
	"application/vnd.curl.car": {
	source: "apache",
	extensions: [
		"car"
	]
},
	"application/vnd.curl.pcurl": {
	source: "apache",
	extensions: [
		"pcurl"
	]
},
	"application/vnd.cyan.dean.root+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.cybank": {
	source: "iana"
},
	"application/vnd.cyclonedx+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.cyclonedx+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.d2l.coursepackage1p0+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.d3m-dataset": {
	source: "iana"
},
	"application/vnd.d3m-problem": {
	source: "iana"
},
	"application/vnd.dart": {
	source: "iana",
	compressible: true,
	extensions: [
		"dart"
	]
},
	"application/vnd.data-vision.rdz": {
	source: "iana",
	extensions: [
		"rdz"
	]
},
	"application/vnd.datalog": {
	source: "iana"
},
	"application/vnd.datapackage+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.dataresource+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.dbf": {
	source: "iana",
	extensions: [
		"dbf"
	]
},
	"application/vnd.dcmp+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"dcmp"
	]
},
	"application/vnd.debian.binary-package": {
	source: "iana"
},
	"application/vnd.dece.data": {
	source: "iana",
	extensions: [
		"uvf",
		"uvvf",
		"uvd",
		"uvvd"
	]
},
	"application/vnd.dece.ttml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"uvt",
		"uvvt"
	]
},
	"application/vnd.dece.unspecified": {
	source: "iana",
	extensions: [
		"uvx",
		"uvvx"
	]
},
	"application/vnd.dece.zip": {
	source: "iana",
	extensions: [
		"uvz",
		"uvvz"
	]
},
	"application/vnd.denovo.fcselayout-link": {
	source: "iana",
	extensions: [
		"fe_launch"
	]
},
	"application/vnd.desmume.movie": {
	source: "iana"
},
	"application/vnd.dir-bi.plate-dl-nosuffix": {
	source: "iana"
},
	"application/vnd.dm.delegation+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dna": {
	source: "iana",
	extensions: [
		"dna"
	]
},
	"application/vnd.document+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.dolby.mlp": {
	source: "apache",
	extensions: [
		"mlp"
	]
},
	"application/vnd.dolby.mobile.1": {
	source: "iana"
},
	"application/vnd.dolby.mobile.2": {
	source: "iana"
},
	"application/vnd.doremir.scorecloud-binary-document": {
	source: "iana"
},
	"application/vnd.dpgraph": {
	source: "iana",
	extensions: [
		"dpg"
	]
},
	"application/vnd.dreamfactory": {
	source: "iana",
	extensions: [
		"dfac"
	]
},
	"application/vnd.drive+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ds-keypoint": {
	source: "apache",
	extensions: [
		"kpxx"
	]
},
	"application/vnd.dtg.local": {
	source: "iana"
},
	"application/vnd.dtg.local.flash": {
	source: "iana"
},
	"application/vnd.dtg.local.html": {
	source: "iana"
},
	"application/vnd.dvb.ait": {
	source: "iana",
	extensions: [
		"ait"
	]
},
	"application/vnd.dvb.dvbisl+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.dvbj": {
	source: "iana"
},
	"application/vnd.dvb.esgcontainer": {
	source: "iana"
},
	"application/vnd.dvb.ipdcdftnotifaccess": {
	source: "iana"
},
	"application/vnd.dvb.ipdcesgaccess": {
	source: "iana"
},
	"application/vnd.dvb.ipdcesgaccess2": {
	source: "iana"
},
	"application/vnd.dvb.ipdcesgpdd": {
	source: "iana"
},
	"application/vnd.dvb.ipdcroaming": {
	source: "iana"
},
	"application/vnd.dvb.iptv.alfec-base": {
	source: "iana"
},
	"application/vnd.dvb.iptv.alfec-enhancement": {
	source: "iana"
},
	"application/vnd.dvb.notif-aggregate-root+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-container+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-generic+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-ia-msglist+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-ia-registration-request+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-ia-registration-response+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.notif-init+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.dvb.pfr": {
	source: "iana"
},
	"application/vnd.dvb.service": {
	source: "iana",
	extensions: [
		"svc"
	]
},
	"application/vnd.dxr": {
	source: "iana"
},
	"application/vnd.dynageo": {
	source: "iana",
	extensions: [
		"geo"
	]
},
	"application/vnd.dzr": {
	source: "iana"
},
	"application/vnd.easykaraoke.cdgdownload": {
	source: "iana"
},
	"application/vnd.ecdis-update": {
	source: "iana"
},
	"application/vnd.ecip.rlp": {
	source: "iana"
},
	"application/vnd.eclipse.ditto+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ecowin.chart": {
	source: "iana",
	extensions: [
		"mag"
	]
},
	"application/vnd.ecowin.filerequest": {
	source: "iana"
},
	"application/vnd.ecowin.fileupdate": {
	source: "iana"
},
	"application/vnd.ecowin.series": {
	source: "iana"
},
	"application/vnd.ecowin.seriesrequest": {
	source: "iana"
},
	"application/vnd.ecowin.seriesupdate": {
	source: "iana"
},
	"application/vnd.efi.img": {
	source: "iana"
},
	"application/vnd.efi.iso": {
	source: "iana"
},
	"application/vnd.eln+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.emclient.accessrequest+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.enliven": {
	source: "iana",
	extensions: [
		"nml"
	]
},
	"application/vnd.enphase.envoy": {
	source: "iana"
},
	"application/vnd.eprints.data+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.epson.esf": {
	source: "iana",
	extensions: [
		"esf"
	]
},
	"application/vnd.epson.msf": {
	source: "iana",
	extensions: [
		"msf"
	]
},
	"application/vnd.epson.quickanime": {
	source: "iana",
	extensions: [
		"qam"
	]
},
	"application/vnd.epson.salt": {
	source: "iana",
	extensions: [
		"slt"
	]
},
	"application/vnd.epson.ssf": {
	source: "iana",
	extensions: [
		"ssf"
	]
},
	"application/vnd.ericsson.quickcall": {
	source: "iana"
},
	"application/vnd.erofs": {
	source: "iana"
},
	"application/vnd.espass-espass+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.eszigno3+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"es3",
		"et3"
	]
},
	"application/vnd.etsi.aoc+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.asic-e+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.etsi.asic-s+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.etsi.cug+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvcommand+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvdiscovery+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvprofile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvsad-bc+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvsad-cod+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvsad-npvr+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvservice+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvsync+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.iptvueprofile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.mcid+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.mheg5": {
	source: "iana"
},
	"application/vnd.etsi.overload-control-policy-dataset+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.pstn+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.sci+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.simservs+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.timestamp-token": {
	source: "iana"
},
	"application/vnd.etsi.tsl+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.etsi.tsl.der": {
	source: "iana"
},
	"application/vnd.eu.kasparian.car+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.eudora.data": {
	source: "iana"
},
	"application/vnd.evolv.ecig.profile": {
	source: "iana"
},
	"application/vnd.evolv.ecig.settings": {
	source: "iana"
},
	"application/vnd.evolv.ecig.theme": {
	source: "iana"
},
	"application/vnd.exstream-empower+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.exstream-package": {
	source: "iana"
},
	"application/vnd.ezpix-album": {
	source: "iana",
	extensions: [
		"ez2"
	]
},
	"application/vnd.ezpix-package": {
	source: "iana",
	extensions: [
		"ez3"
	]
},
	"application/vnd.f-secure.mobile": {
	source: "iana"
},
	"application/vnd.familysearch.gedcom+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.fastcopy-disk-image": {
	source: "iana"
},
	"application/vnd.fdf": {
	source: "apache",
	extensions: [
		"fdf"
	]
},
	"application/vnd.fdsn.mseed": {
	source: "iana",
	extensions: [
		"mseed"
	]
},
	"application/vnd.fdsn.seed": {
	source: "iana",
	extensions: [
		"seed",
		"dataless"
	]
},
	"application/vnd.fdsn.stationxml+xml": {
	source: "iana",
	charset: "XML-BASED",
	compressible: true
},
	"application/vnd.ffsns": {
	source: "iana"
},
	"application/vnd.ficlab.flb+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.filmit.zfc": {
	source: "iana"
},
	"application/vnd.fints": {
	source: "iana"
},
	"application/vnd.firemonkeys.cloudcell": {
	source: "iana"
},
	"application/vnd.flographit": {
	source: "iana",
	extensions: [
		"gph"
	]
},
	"application/vnd.fluxtime.clip": {
	source: "iana",
	extensions: [
		"ftc"
	]
},
	"application/vnd.font-fontforge-sfd": {
	source: "iana"
},
	"application/vnd.framemaker": {
	source: "iana",
	extensions: [
		"fm",
		"frame",
		"maker",
		"book"
	]
},
	"application/vnd.freelog.comic": {
	source: "iana"
},
	"application/vnd.frogans.fnc": {
	source: "apache",
	extensions: [
		"fnc"
	]
},
	"application/vnd.frogans.ltf": {
	source: "apache",
	extensions: [
		"ltf"
	]
},
	"application/vnd.fsc.weblaunch": {
	source: "iana",
	extensions: [
		"fsc"
	]
},
	"application/vnd.fujifilm.fb.docuworks": {
	source: "iana"
},
	"application/vnd.fujifilm.fb.docuworks.binder": {
	source: "iana"
},
	"application/vnd.fujifilm.fb.docuworks.container": {
	source: "iana"
},
	"application/vnd.fujifilm.fb.jfi+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.fujitsu.oasys": {
	source: "iana",
	extensions: [
		"oas"
	]
},
	"application/vnd.fujitsu.oasys2": {
	source: "iana",
	extensions: [
		"oa2"
	]
},
	"application/vnd.fujitsu.oasys3": {
	source: "iana",
	extensions: [
		"oa3"
	]
},
	"application/vnd.fujitsu.oasysgp": {
	source: "iana",
	extensions: [
		"fg5"
	]
},
	"application/vnd.fujitsu.oasysprs": {
	source: "iana",
	extensions: [
		"bh2"
	]
},
	"application/vnd.fujixerox.art-ex": {
	source: "iana"
},
	"application/vnd.fujixerox.art4": {
	source: "iana"
},
	"application/vnd.fujixerox.ddd": {
	source: "iana",
	extensions: [
		"ddd"
	]
},
	"application/vnd.fujixerox.docuworks": {
	source: "iana",
	extensions: [
		"xdw"
	]
},
	"application/vnd.fujixerox.docuworks.binder": {
	source: "iana",
	extensions: [
		"xbd"
	]
},
	"application/vnd.fujixerox.docuworks.container": {
	source: "iana"
},
	"application/vnd.fujixerox.hbpl": {
	source: "iana"
},
	"application/vnd.fut-misnet": {
	source: "iana"
},
	"application/vnd.futoin+cbor": {
	source: "iana"
},
	"application/vnd.futoin+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.fuzzysheet": {
	source: "iana",
	extensions: [
		"fzs"
	]
},
	"application/vnd.ga4gh.passport+jwt": {
	source: "iana"
},
	"application/vnd.genomatix.tuxedo": {
	source: "iana",
	extensions: [
		"txd"
	]
},
	"application/vnd.genozip": {
	source: "iana"
},
	"application/vnd.gentics.grd+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.gentoo.catmetadata+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.gentoo.ebuild": {
	source: "iana"
},
	"application/vnd.gentoo.eclass": {
	source: "iana"
},
	"application/vnd.gentoo.gpkg": {
	source: "iana"
},
	"application/vnd.gentoo.manifest": {
	source: "iana"
},
	"application/vnd.gentoo.pkgmetadata+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.gentoo.xpak": {
	source: "iana"
},
	"application/vnd.geo+json": {
	source: "apache",
	compressible: true
},
	"application/vnd.geocube+xml": {
	source: "apache",
	compressible: true
},
	"application/vnd.geogebra.file": {
	source: "iana",
	extensions: [
		"ggb"
	]
},
	"application/vnd.geogebra.pinboard": {
	source: "iana"
},
	"application/vnd.geogebra.slides": {
	source: "iana",
	extensions: [
		"ggs"
	]
},
	"application/vnd.geogebra.tool": {
	source: "iana",
	extensions: [
		"ggt"
	]
},
	"application/vnd.geometry-explorer": {
	source: "iana",
	extensions: [
		"gex",
		"gre"
	]
},
	"application/vnd.geonext": {
	source: "iana",
	extensions: [
		"gxt"
	]
},
	"application/vnd.geoplan": {
	source: "iana",
	extensions: [
		"g2w"
	]
},
	"application/vnd.geospace": {
	source: "iana",
	extensions: [
		"g3w"
	]
},
	"application/vnd.gerber": {
	source: "iana"
},
	"application/vnd.globalplatform.card-content-mgt": {
	source: "iana"
},
	"application/vnd.globalplatform.card-content-mgt-response": {
	source: "iana"
},
	"application/vnd.gmx": {
	source: "iana",
	extensions: [
		"gmx"
	]
},
	"application/vnd.gnu.taler.exchange+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.gnu.taler.merchant+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.google-apps.audio": {
},
	"application/vnd.google-apps.document": {
	compressible: false,
	extensions: [
		"gdoc"
	]
},
	"application/vnd.google-apps.drawing": {
	compressible: false,
	extensions: [
		"gdraw"
	]
},
	"application/vnd.google-apps.drive-sdk": {
	compressible: false
},
	"application/vnd.google-apps.file": {
},
	"application/vnd.google-apps.folder": {
	compressible: false
},
	"application/vnd.google-apps.form": {
	compressible: false,
	extensions: [
		"gform"
	]
},
	"application/vnd.google-apps.fusiontable": {
},
	"application/vnd.google-apps.jam": {
	compressible: false,
	extensions: [
		"gjam"
	]
},
	"application/vnd.google-apps.mail-layout": {
},
	"application/vnd.google-apps.map": {
	compressible: false,
	extensions: [
		"gmap"
	]
},
	"application/vnd.google-apps.photo": {
},
	"application/vnd.google-apps.presentation": {
	compressible: false,
	extensions: [
		"gslides"
	]
},
	"application/vnd.google-apps.script": {
	compressible: false,
	extensions: [
		"gscript"
	]
},
	"application/vnd.google-apps.shortcut": {
},
	"application/vnd.google-apps.site": {
	compressible: false,
	extensions: [
		"gsite"
	]
},
	"application/vnd.google-apps.spreadsheet": {
	compressible: false,
	extensions: [
		"gsheet"
	]
},
	"application/vnd.google-apps.unknown": {
},
	"application/vnd.google-apps.video": {
},
	"application/vnd.google-earth.kml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"kml"
	]
},
	"application/vnd.google-earth.kmz": {
	source: "iana",
	compressible: false,
	extensions: [
		"kmz"
	]
},
	"application/vnd.gov.sk.e-form+xml": {
	source: "apache",
	compressible: true
},
	"application/vnd.gov.sk.e-form+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.gov.sk.xmldatacontainer+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xdcf"
	]
},
	"application/vnd.gpxsee.map+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.grafeq": {
	source: "iana",
	extensions: [
		"gqf",
		"gqs"
	]
},
	"application/vnd.gridmp": {
	source: "iana"
},
	"application/vnd.groove-account": {
	source: "iana",
	extensions: [
		"gac"
	]
},
	"application/vnd.groove-help": {
	source: "iana",
	extensions: [
		"ghf"
	]
},
	"application/vnd.groove-identity-message": {
	source: "iana",
	extensions: [
		"gim"
	]
},
	"application/vnd.groove-injector": {
	source: "iana",
	extensions: [
		"grv"
	]
},
	"application/vnd.groove-tool-message": {
	source: "iana",
	extensions: [
		"gtm"
	]
},
	"application/vnd.groove-tool-template": {
	source: "iana",
	extensions: [
		"tpl"
	]
},
	"application/vnd.groove-vcard": {
	source: "iana",
	extensions: [
		"vcg"
	]
},
	"application/vnd.hal+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hal+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"hal"
	]
},
	"application/vnd.handheld-entertainment+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"zmm"
	]
},
	"application/vnd.hbci": {
	source: "iana",
	extensions: [
		"hbci"
	]
},
	"application/vnd.hc+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hcl-bireports": {
	source: "iana"
},
	"application/vnd.hdt": {
	source: "iana"
},
	"application/vnd.heroku+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hhe.lesson-player": {
	source: "iana",
	extensions: [
		"les"
	]
},
	"application/vnd.hp-hpgl": {
	source: "iana",
	extensions: [
		"hpgl"
	]
},
	"application/vnd.hp-hpid": {
	source: "iana",
	extensions: [
		"hpid"
	]
},
	"application/vnd.hp-hps": {
	source: "iana",
	extensions: [
		"hps"
	]
},
	"application/vnd.hp-jlyt": {
	source: "iana",
	extensions: [
		"jlt"
	]
},
	"application/vnd.hp-pcl": {
	source: "iana",
	extensions: [
		"pcl"
	]
},
	"application/vnd.hp-pclxl": {
	source: "iana",
	extensions: [
		"pclxl"
	]
},
	"application/vnd.hsl": {
	source: "iana"
},
	"application/vnd.httphone": {
	source: "iana"
},
	"application/vnd.hydrostatix.sof-data": {
	source: "iana",
	extensions: [
		"sfd-hdstx"
	]
},
	"application/vnd.hyper+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hyper-item+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hyperdrive+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.hzn-3d-crossword": {
	source: "iana"
},
	"application/vnd.ibm.afplinedata": {
	source: "apache"
},
	"application/vnd.ibm.electronic-media": {
	source: "iana"
},
	"application/vnd.ibm.minipay": {
	source: "iana",
	extensions: [
		"mpy"
	]
},
	"application/vnd.ibm.modcap": {
	source: "apache",
	extensions: [
		"afp",
		"listafp",
		"list3820"
	]
},
	"application/vnd.ibm.rights-management": {
	source: "iana",
	extensions: [
		"irm"
	]
},
	"application/vnd.ibm.secure-container": {
	source: "iana",
	extensions: [
		"sc"
	]
},
	"application/vnd.iccprofile": {
	source: "iana",
	extensions: [
		"icc",
		"icm"
	]
},
	"application/vnd.ieee.1905": {
	source: "iana"
},
	"application/vnd.igloader": {
	source: "iana",
	extensions: [
		"igl"
	]
},
	"application/vnd.imagemeter.folder+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.imagemeter.image+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.immervision-ivp": {
	source: "iana",
	extensions: [
		"ivp"
	]
},
	"application/vnd.immervision-ivu": {
	source: "iana",
	extensions: [
		"ivu"
	]
},
	"application/vnd.ims.imsccv1p1": {
	source: "iana"
},
	"application/vnd.ims.imsccv1p2": {
	source: "iana"
},
	"application/vnd.ims.imsccv1p3": {
	source: "iana"
},
	"application/vnd.ims.lis.v2.result+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ims.lti.v2.toolconsumerprofile+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ims.lti.v2.toolproxy+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ims.lti.v2.toolproxy.id+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ims.lti.v2.toolsettings+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.ims.lti.v2.toolsettings.simple+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.informedcontrol.rms+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.informix-visionary": {
	source: "apache"
},
	"application/vnd.infotech.project": {
	source: "iana"
},
	"application/vnd.infotech.project+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.innopath.wamp.notification": {
	source: "iana"
},
	"application/vnd.insors.igm": {
	source: "iana",
	extensions: [
		"igm"
	]
},
	"application/vnd.intercon.formnet": {
	source: "iana",
	extensions: [
		"xpw",
		"xpx"
	]
},
	"application/vnd.intergeo": {
	source: "iana",
	extensions: [
		"i2g"
	]
},
	"application/vnd.intertrust.digibox": {
	source: "iana"
},
	"application/vnd.intertrust.nncp": {
	source: "iana"
},
	"application/vnd.intu.qbo": {
	source: "iana",
	extensions: [
		"qbo"
	]
},
	"application/vnd.intu.qfx": {
	source: "iana",
	extensions: [
		"qfx"
	]
},
	"application/vnd.ipfs.ipns-record": {
	source: "iana"
},
	"application/vnd.ipld.car": {
	source: "iana"
},
	"application/vnd.ipld.dag-cbor": {
	source: "iana"
},
	"application/vnd.ipld.dag-json": {
	source: "iana"
},
	"application/vnd.ipld.raw": {
	source: "iana"
},
	"application/vnd.iptc.g2.catalogitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.conceptitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.knowledgeitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.newsitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.newsmessage+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.packageitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.iptc.g2.planningitem+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.ipunplugged.rcprofile": {
	source: "iana",
	extensions: [
		"rcprofile"
	]
},
	"application/vnd.irepository.package+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"irp"
	]
},
	"application/vnd.is-xpr": {
	source: "iana",
	extensions: [
		"xpr"
	]
},
	"application/vnd.isac.fcs": {
	source: "iana",
	extensions: [
		"fcs"
	]
},
	"application/vnd.iso11783-10+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.jam": {
	source: "iana",
	extensions: [
		"jam"
	]
},
	"application/vnd.japannet-directory-service": {
	source: "iana"
},
	"application/vnd.japannet-jpnstore-wakeup": {
	source: "iana"
},
	"application/vnd.japannet-payment-wakeup": {
	source: "iana"
},
	"application/vnd.japannet-registration": {
	source: "iana"
},
	"application/vnd.japannet-registration-wakeup": {
	source: "iana"
},
	"application/vnd.japannet-setstore-wakeup": {
	source: "iana"
},
	"application/vnd.japannet-verification": {
	source: "iana"
},
	"application/vnd.japannet-verification-wakeup": {
	source: "iana"
},
	"application/vnd.jcp.javame.midlet-rms": {
	source: "iana",
	extensions: [
		"rms"
	]
},
	"application/vnd.jisp": {
	source: "iana",
	extensions: [
		"jisp"
	]
},
	"application/vnd.joost.joda-archive": {
	source: "iana",
	extensions: [
		"joda"
	]
},
	"application/vnd.jsk.isdn-ngn": {
	source: "iana"
},
	"application/vnd.kahootz": {
	source: "iana",
	extensions: [
		"ktz",
		"ktr"
	]
},
	"application/vnd.kde.karbon": {
	source: "iana",
	extensions: [
		"karbon"
	]
},
	"application/vnd.kde.kchart": {
	source: "iana",
	extensions: [
		"chrt"
	]
},
	"application/vnd.kde.kformula": {
	source: "iana",
	extensions: [
		"kfo"
	]
},
	"application/vnd.kde.kivio": {
	source: "iana",
	extensions: [
		"flw"
	]
},
	"application/vnd.kde.kontour": {
	source: "iana",
	extensions: [
		"kon"
	]
},
	"application/vnd.kde.kpresenter": {
	source: "iana",
	extensions: [
		"kpr",
		"kpt"
	]
},
	"application/vnd.kde.kspread": {
	source: "iana",
	extensions: [
		"ksp"
	]
},
	"application/vnd.kde.kword": {
	source: "iana",
	extensions: [
		"kwd",
		"kwt"
	]
},
	"application/vnd.kdl": {
	source: "iana"
},
	"application/vnd.kenameaapp": {
	source: "iana",
	extensions: [
		"htke"
	]
},
	"application/vnd.keyman.kmp+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.keyman.kmx": {
	source: "iana"
},
	"application/vnd.kidspiration": {
	source: "iana",
	extensions: [
		"kia"
	]
},
	"application/vnd.kinar": {
	source: "iana",
	extensions: [
		"kne",
		"knp"
	]
},
	"application/vnd.koan": {
	source: "iana",
	extensions: [
		"skp",
		"skd",
		"skt",
		"skm"
	]
},
	"application/vnd.kodak-descriptor": {
	source: "iana",
	extensions: [
		"sse"
	]
},
	"application/vnd.las": {
	source: "iana"
},
	"application/vnd.las.las+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.las.las+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"lasxml"
	]
},
	"application/vnd.laszip": {
	source: "iana"
},
	"application/vnd.ldev.productlicensing": {
	source: "iana"
},
	"application/vnd.leap+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.liberty-request+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.llamagraphics.life-balance.desktop": {
	source: "iana",
	extensions: [
		"lbd"
	]
},
	"application/vnd.llamagraphics.life-balance.exchange+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"lbe"
	]
},
	"application/vnd.logipipe.circuit+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.loom": {
	source: "iana"
},
	"application/vnd.lotus-1-2-3": {
	source: "iana",
	extensions: [
		"123"
	]
},
	"application/vnd.lotus-approach": {
	source: "iana",
	extensions: [
		"apr"
	]
},
	"application/vnd.lotus-freelance": {
	source: "iana",
	extensions: [
		"pre"
	]
},
	"application/vnd.lotus-notes": {
	source: "iana",
	extensions: [
		"nsf"
	]
},
	"application/vnd.lotus-organizer": {
	source: "iana",
	extensions: [
		"org"
	]
},
	"application/vnd.lotus-screencam": {
	source: "iana",
	extensions: [
		"scm"
	]
},
	"application/vnd.lotus-wordpro": {
	source: "iana",
	extensions: [
		"lwp"
	]
},
	"application/vnd.macports.portpkg": {
	source: "iana",
	extensions: [
		"portpkg"
	]
},
	"application/vnd.mapbox-vector-tile": {
	source: "iana",
	extensions: [
		"mvt"
	]
},
	"application/vnd.marlin.drm.actiontoken+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.marlin.drm.conftoken+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.marlin.drm.license+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.marlin.drm.mdcf": {
	source: "iana"
},
	"application/vnd.mason+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.maxar.archive.3tz+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.maxmind.maxmind-db": {
	source: "iana"
},
	"application/vnd.mcd": {
	source: "iana",
	extensions: [
		"mcd"
	]
},
	"application/vnd.mdl": {
	source: "iana"
},
	"application/vnd.mdl-mbsdf": {
	source: "iana"
},
	"application/vnd.medcalcdata": {
	source: "iana",
	extensions: [
		"mc1"
	]
},
	"application/vnd.mediastation.cdkey": {
	source: "iana",
	extensions: [
		"cdkey"
	]
},
	"application/vnd.medicalholodeck.recordxr": {
	source: "iana"
},
	"application/vnd.meridian-slingshot": {
	source: "iana"
},
	"application/vnd.mermaid": {
	source: "iana"
},
	"application/vnd.mfer": {
	source: "iana",
	extensions: [
		"mwf"
	]
},
	"application/vnd.mfmp": {
	source: "iana",
	extensions: [
		"mfm"
	]
},
	"application/vnd.micro+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.micrografx.flo": {
	source: "iana",
	extensions: [
		"flo"
	]
},
	"application/vnd.micrografx.igx": {
	source: "iana",
	extensions: [
		"igx"
	]
},
	"application/vnd.microsoft.portable-executable": {
	source: "iana"
},
	"application/vnd.microsoft.windows.thumbnail-cache": {
	source: "iana"
},
	"application/vnd.miele+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.mif": {
	source: "iana",
	extensions: [
		"mif"
	]
},
	"application/vnd.minisoft-hp3000-save": {
	source: "iana"
},
	"application/vnd.mitsubishi.misty-guard.trustweb": {
	source: "iana"
},
	"application/vnd.mobius.daf": {
	source: "iana",
	extensions: [
		"daf"
	]
},
	"application/vnd.mobius.dis": {
	source: "iana",
	extensions: [
		"dis"
	]
},
	"application/vnd.mobius.mbk": {
	source: "iana",
	extensions: [
		"mbk"
	]
},
	"application/vnd.mobius.mqy": {
	source: "iana",
	extensions: [
		"mqy"
	]
},
	"application/vnd.mobius.msl": {
	source: "iana",
	extensions: [
		"msl"
	]
},
	"application/vnd.mobius.plc": {
	source: "iana",
	extensions: [
		"plc"
	]
},
	"application/vnd.mobius.txf": {
	source: "iana",
	extensions: [
		"txf"
	]
},
	"application/vnd.modl": {
	source: "iana"
},
	"application/vnd.mophun.application": {
	source: "iana",
	extensions: [
		"mpn"
	]
},
	"application/vnd.mophun.certificate": {
	source: "iana",
	extensions: [
		"mpc"
	]
},
	"application/vnd.motorola.flexsuite": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.adsi": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.fis": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.gotap": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.kmr": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.ttc": {
	source: "iana"
},
	"application/vnd.motorola.flexsuite.wem": {
	source: "iana"
},
	"application/vnd.motorola.iprm": {
	source: "iana"
},
	"application/vnd.mozilla.xul+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xul"
	]
},
	"application/vnd.ms-3mfdocument": {
	source: "iana"
},
	"application/vnd.ms-artgalry": {
	source: "iana",
	extensions: [
		"cil"
	]
},
	"application/vnd.ms-asf": {
	source: "iana"
},
	"application/vnd.ms-cab-compressed": {
	source: "iana",
	extensions: [
		"cab"
	]
},
	"application/vnd.ms-color.iccprofile": {
	source: "apache"
},
	"application/vnd.ms-excel": {
	source: "iana",
	compressible: false,
	extensions: [
		"xls",
		"xlm",
		"xla",
		"xlc",
		"xlt",
		"xlw"
	]
},
	"application/vnd.ms-excel.addin.macroenabled.12": {
	source: "iana",
	extensions: [
		"xlam"
	]
},
	"application/vnd.ms-excel.sheet.binary.macroenabled.12": {
	source: "iana",
	extensions: [
		"xlsb"
	]
},
	"application/vnd.ms-excel.sheet.macroenabled.12": {
	source: "iana",
	extensions: [
		"xlsm"
	]
},
	"application/vnd.ms-excel.template.macroenabled.12": {
	source: "iana",
	extensions: [
		"xltm"
	]
},
	"application/vnd.ms-fontobject": {
	source: "iana",
	compressible: true,
	extensions: [
		"eot"
	]
},
	"application/vnd.ms-htmlhelp": {
	source: "iana",
	extensions: [
		"chm"
	]
},
	"application/vnd.ms-ims": {
	source: "iana",
	extensions: [
		"ims"
	]
},
	"application/vnd.ms-lrm": {
	source: "iana",
	extensions: [
		"lrm"
	]
},
	"application/vnd.ms-office.activex+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.ms-officetheme": {
	source: "iana",
	extensions: [
		"thmx"
	]
},
	"application/vnd.ms-opentype": {
	source: "apache",
	compressible: true
},
	"application/vnd.ms-outlook": {
	compressible: false,
	extensions: [
		"msg"
	]
},
	"application/vnd.ms-package.obfuscated-opentype": {
	source: "apache"
},
	"application/vnd.ms-pki.seccat": {
	source: "apache",
	extensions: [
		"cat"
	]
},
	"application/vnd.ms-pki.stl": {
	source: "apache",
	extensions: [
		"stl"
	]
},
	"application/vnd.ms-playready.initiator+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.ms-powerpoint": {
	source: "iana",
	compressible: false,
	extensions: [
		"ppt",
		"pps",
		"pot"
	]
},
	"application/vnd.ms-powerpoint.addin.macroenabled.12": {
	source: "iana",
	extensions: [
		"ppam"
	]
},
	"application/vnd.ms-powerpoint.presentation.macroenabled.12": {
	source: "iana",
	extensions: [
		"pptm"
	]
},
	"application/vnd.ms-powerpoint.slide.macroenabled.12": {
	source: "iana",
	extensions: [
		"sldm"
	]
},
	"application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
	source: "iana",
	extensions: [
		"ppsm"
	]
},
	"application/vnd.ms-powerpoint.template.macroenabled.12": {
	source: "iana",
	extensions: [
		"potm"
	]
},
	"application/vnd.ms-printdevicecapabilities+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.ms-printing.printticket+xml": {
	source: "apache",
	compressible: true
},
	"application/vnd.ms-printschematicket+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.ms-project": {
	source: "iana",
	extensions: [
		"mpp",
		"mpt"
	]
},
	"application/vnd.ms-tnef": {
	source: "iana"
},
	"application/vnd.ms-visio.viewer": {
	extensions: [
		"vdx"
	]
},
	"application/vnd.ms-windows.devicepairing": {
	source: "iana"
},
	"application/vnd.ms-windows.nwprinting.oob": {
	source: "iana"
},
	"application/vnd.ms-windows.printerpairing": {
	source: "iana"
},
	"application/vnd.ms-windows.wsd.oob": {
	source: "iana"
},
	"application/vnd.ms-wmdrm.lic-chlg-req": {
	source: "iana"
},
	"application/vnd.ms-wmdrm.lic-resp": {
	source: "iana"
},
	"application/vnd.ms-wmdrm.meter-chlg-req": {
	source: "iana"
},
	"application/vnd.ms-wmdrm.meter-resp": {
	source: "iana"
},
	"application/vnd.ms-word.document.macroenabled.12": {
	source: "iana",
	extensions: [
		"docm"
	]
},
	"application/vnd.ms-word.template.macroenabled.12": {
	source: "iana",
	extensions: [
		"dotm"
	]
},
	"application/vnd.ms-works": {
	source: "iana",
	extensions: [
		"wps",
		"wks",
		"wcm",
		"wdb"
	]
},
	"application/vnd.ms-wpl": {
	source: "iana",
	extensions: [
		"wpl"
	]
},
	"application/vnd.ms-xpsdocument": {
	source: "iana",
	compressible: false,
	extensions: [
		"xps"
	]
},
	"application/vnd.msa-disk-image": {
	source: "iana"
},
	"application/vnd.mseq": {
	source: "iana",
	extensions: [
		"mseq"
	]
},
	"application/vnd.msgpack": {
	source: "iana"
},
	"application/vnd.msign": {
	source: "iana"
},
	"application/vnd.multiad.creator": {
	source: "iana"
},
	"application/vnd.multiad.creator.cif": {
	source: "iana"
},
	"application/vnd.music-niff": {
	source: "iana"
},
	"application/vnd.musician": {
	source: "iana",
	extensions: [
		"mus"
	]
},
	"application/vnd.muvee.style": {
	source: "iana",
	extensions: [
		"msty"
	]
},
	"application/vnd.mynfc": {
	source: "iana",
	extensions: [
		"taglet"
	]
},
	"application/vnd.nacamar.ybrid+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.nato.bindingdataobject+cbor": {
	source: "iana"
},
	"application/vnd.nato.bindingdataobject+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.nato.bindingdataobject+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"bdo"
	]
},
	"application/vnd.nato.openxmlformats-package.iepd+zip": {
	source: "iana",
	compressible: false
},
	"application/vnd.ncd.control": {
	source: "iana"
},
	"application/vnd.ncd.reference": {
	source: "iana"
},
	"application/vnd.nearst.inv+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.nebumind.line": {
	source: "iana"
},
	"application/vnd.nervana": {
	source: "iana"
},
	"application/vnd.netfpx": {
	source: "iana"
},
	"application/vnd.neurolanguage.nlu": {
	source: "iana",
	extensions: [
		"nlu"
	]
},
	"application/vnd.nimn": {
	source: "iana"
},
	"application/vnd.nintendo.nitro.rom": {
	source: "iana"
},
	"application/vnd.nintendo.snes.rom": {
	source: "iana"
},
	"application/vnd.nitf": {
	source: "iana",
	extensions: [
		"ntf",
		"nitf"
	]
},
	"application/vnd.noblenet-directory": {
	source: "iana",
	extensions: [
		"nnd"
	]
},
	"application/vnd.noblenet-sealer": {
	source: "iana",
	extensions: [
		"nns"
	]
},
	"application/vnd.noblenet-web": {
	source: "iana",
	extensions: [
		"nnw"
	]
},
	"application/vnd.nokia.catalogs": {
	source: "iana"
},
	"application/vnd.nokia.conml+wbxml": {
	source: "iana"
},
	"application/vnd.nokia.conml+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.nokia.iptv.config+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.nokia.isds-radio-presets": {
	source: "iana"
},
	"application/vnd.nokia.landmark+wbxml": {
	source: "iana"
},
	"application/vnd.nokia.landmark+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.nokia.landmarkcollection+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.nokia.n-gage.ac+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"ac"
	]
},
	"application/vnd.nokia.n-gage.data": {
	source: "iana",
	extensions: [
		"ngdat"
	]
},
	"application/vnd.nokia.n-gage.symbian.install": {
	source: "apache",
	extensions: [
		"n-gage"
	]
},
	"application/vnd.nokia.ncd": {
	source: "iana"
},
	"application/vnd.nokia.pcd+wbxml": {
	source: "iana"
},
	"application/vnd.nokia.pcd+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.nokia.radio-preset": {
	source: "iana",
	extensions: [
		"rpst"
	]
},
	"application/vnd.nokia.radio-presets": {
	source: "iana",
	extensions: [
		"rpss"
	]
},
	"application/vnd.novadigm.edm": {
	source: "iana",
	extensions: [
		"edm"
	]
},
	"application/vnd.novadigm.edx": {
	source: "iana",
	extensions: [
		"edx"
	]
},
	"application/vnd.novadigm.ext": {
	source: "iana",
	extensions: [
		"ext"
	]
},
	"application/vnd.ntt-local.content-share": {
	source: "iana"
},
	"application/vnd.ntt-local.file-transfer": {
	source: "iana"
},
	"application/vnd.ntt-local.ogw_remote-access": {
	source: "iana"
},
	"application/vnd.ntt-local.sip-ta_remote": {
	source: "iana"
},
	"application/vnd.ntt-local.sip-ta_tcp_stream": {
	source: "iana"
},
	"application/vnd.oai.workflows": {
	source: "iana"
},
	"application/vnd.oai.workflows+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.oai.workflows+yaml": {
	source: "iana"
},
	"application/vnd.oasis.opendocument.base": {
	source: "iana"
},
	"application/vnd.oasis.opendocument.chart": {
	source: "iana",
	extensions: [
		"odc"
	]
},
	"application/vnd.oasis.opendocument.chart-template": {
	source: "iana",
	extensions: [
		"otc"
	]
},
	"application/vnd.oasis.opendocument.database": {
	source: "apache",
	extensions: [
		"odb"
	]
},
	"application/vnd.oasis.opendocument.formula": {
	source: "iana",
	extensions: [
		"odf"
	]
},
	"application/vnd.oasis.opendocument.formula-template": {
	source: "iana",
	extensions: [
		"odft"
	]
},
	"application/vnd.oasis.opendocument.graphics": {
	source: "iana",
	compressible: false,
	extensions: [
		"odg"
	]
},
	"application/vnd.oasis.opendocument.graphics-template": {
	source: "iana",
	extensions: [
		"otg"
	]
},
	"application/vnd.oasis.opendocument.image": {
	source: "iana",
	extensions: [
		"odi"
	]
},
	"application/vnd.oasis.opendocument.image-template": {
	source: "iana",
	extensions: [
		"oti"
	]
},
	"application/vnd.oasis.opendocument.presentation": {
	source: "iana",
	compressible: false,
	extensions: [
		"odp"
	]
},
	"application/vnd.oasis.opendocument.presentation-template": {
	source: "iana",
	extensions: [
		"otp"
	]
},
	"application/vnd.oasis.opendocument.spreadsheet": {
	source: "iana",
	compressible: false,
	extensions: [
		"ods"
	]
},
	"application/vnd.oasis.opendocument.spreadsheet-template": {
	source: "iana",
	extensions: [
		"ots"
	]
},
	"application/vnd.oasis.opendocument.text": {
	source: "iana",
	compressible: false,
	extensions: [
		"odt"
	]
},
	"application/vnd.oasis.opendocument.text-master": {
	source: "iana",
	extensions: [
		"odm"
	]
},
	"application/vnd.oasis.opendocument.text-master-template": {
	source: "iana"
},
	"application/vnd.oasis.opendocument.text-template": {
	source: "iana",
	extensions: [
		"ott"
	]
},
	"application/vnd.oasis.opendocument.text-web": {
	source: "iana",
	extensions: [
		"oth"
	]
},
	"application/vnd.obn": {
	source: "iana"
},
	"application/vnd.ocf+cbor": {
	source: "iana"
},
	"application/vnd.oci.image.manifest.v1+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.oftn.l10n+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.contentaccessdownload+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.contentaccessstreaming+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.cspg-hexbinary": {
	source: "iana"
},
	"application/vnd.oipf.dae.svg+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.dae.xhtml+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.mippvcontrolmessage+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.pae.gem": {
	source: "iana"
},
	"application/vnd.oipf.spdiscovery+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.spdlist+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.ueprofile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oipf.userprofile+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.olpc-sugar": {
	source: "iana",
	extensions: [
		"xo"
	]
},
	"application/vnd.oma-scws-config": {
	source: "iana"
},
	"application/vnd.oma-scws-http-request": {
	source: "iana"
},
	"application/vnd.oma-scws-http-response": {
	source: "iana"
},
	"application/vnd.oma.bcast.associated-procedure-parameter+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.bcast.drm-trigger+xml": {
	source: "apache",
	compressible: true
},
	"application/vnd.oma.bcast.imd+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.bcast.ltkm": {
	source: "iana"
},
	"application/vnd.oma.bcast.notification+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.bcast.provisioningtrigger": {
	source: "iana"
},
	"application/vnd.oma.bcast.sgboot": {
	source: "iana"
},
	"application/vnd.oma.bcast.sgdd+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.bcast.sgdu": {
	source: "iana"
},
	"application/vnd.oma.bcast.simple-symbol-container": {
	source: "iana"
},
	"application/vnd.oma.bcast.smartcard-trigger+xml": {
	source: "apache",
	compressible: true
},
	"application/vnd.oma.bcast.sprov+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.bcast.stkm": {
	source: "iana"
},
	"application/vnd.oma.cab-address-book+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.cab-feature-handler+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.cab-pcc+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.cab-subs-invite+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.cab-user-prefs+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.dcd": {
	source: "iana"
},
	"application/vnd.oma.dcdc": {
	source: "iana"
},
	"application/vnd.oma.dd2+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"dd2"
	]
},
	"application/vnd.oma.drm.risd+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.group-usage-list+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.lwm2m+cbor": {
	source: "iana"
},
	"application/vnd.oma.lwm2m+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.lwm2m+tlv": {
	source: "iana"
},
	"application/vnd.oma.pal+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.poc.detailed-progress-report+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.poc.final-report+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.poc.groups+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.poc.invocation-descriptor+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.poc.optimized-progress-report+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.push": {
	source: "iana"
},
	"application/vnd.oma.scidm.messages+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oma.xcap-directory+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.omads-email+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/vnd.omads-file+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/vnd.omads-folder+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/vnd.omaloc-supl-init": {
	source: "iana"
},
	"application/vnd.onepager": {
	source: "iana"
},
	"application/vnd.onepagertamp": {
	source: "iana"
},
	"application/vnd.onepagertamx": {
	source: "iana"
},
	"application/vnd.onepagertat": {
	source: "iana"
},
	"application/vnd.onepagertatp": {
	source: "iana"
},
	"application/vnd.onepagertatx": {
	source: "iana"
},
	"application/vnd.onvif.metadata": {
	source: "iana"
},
	"application/vnd.openblox.game+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"obgx"
	]
},
	"application/vnd.openblox.game-binary": {
	source: "iana"
},
	"application/vnd.openeye.oeb": {
	source: "iana"
},
	"application/vnd.openofficeorg.extension": {
	source: "apache",
	extensions: [
		"oxt"
	]
},
	"application/vnd.openstreetmap.data+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"osm"
	]
},
	"application/vnd.opentimestamps.ots": {
	source: "iana"
},
	"application/vnd.openvpi.dspx+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.custom-properties+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawing+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.extended-properties+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": {
	source: "iana",
	compressible: false,
	extensions: [
		"pptx"
	]
},
	"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.slide": {
	source: "iana",
	extensions: [
		"sldx"
	]
},
	"application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
	source: "iana",
	extensions: [
		"ppsx"
	]
},
	"application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.template": {
	source: "iana",
	extensions: [
		"potx"
	]
},
	"application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
	source: "iana",
	compressible: false,
	extensions: [
		"xlsx"
	]
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
	source: "iana",
	extensions: [
		"xltx"
	]
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.theme+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.themeoverride+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.vmldrawing": {
	source: "iana"
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
	source: "iana",
	compressible: false,
	extensions: [
		"docx"
	]
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
	source: "iana",
	extensions: [
		"dotx"
	]
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-package.core-properties+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.openxmlformats-package.relationships+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oracle.resource+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.orange.indata": {
	source: "iana"
},
	"application/vnd.osa.netdeploy": {
	source: "iana"
},
	"application/vnd.osgeo.mapguide.package": {
	source: "iana",
	extensions: [
		"mgp"
	]
},
	"application/vnd.osgi.bundle": {
	source: "iana"
},
	"application/vnd.osgi.dp": {
	source: "iana",
	extensions: [
		"dp"
	]
},
	"application/vnd.osgi.subsystem": {
	source: "iana",
	extensions: [
		"esa"
	]
},
	"application/vnd.otps.ct-kip+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.oxli.countgraph": {
	source: "iana"
},
	"application/vnd.pagerduty+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.palm": {
	source: "iana",
	extensions: [
		"pdb",
		"pqa",
		"oprc"
	]
},
	"application/vnd.panoply": {
	source: "iana"
},
	"application/vnd.paos.xml": {
	source: "iana"
},
	"application/vnd.patentdive": {
	source: "iana"
},
	"application/vnd.patientecommsdoc": {
	source: "iana"
},
	"application/vnd.pawaafile": {
	source: "iana",
	extensions: [
		"paw"
	]
},
	"application/vnd.pcos": {
	source: "iana"
},
	"application/vnd.pg.format": {
	source: "iana",
	extensions: [
		"str"
	]
},
	"application/vnd.pg.osasli": {
	source: "iana",
	extensions: [
		"ei6"
	]
},
	"application/vnd.piaccess.application-licence": {
	source: "iana"
},
	"application/vnd.picsel": {
	source: "iana",
	extensions: [
		"efif"
	]
},
	"application/vnd.pmi.widget": {
	source: "iana",
	extensions: [
		"wg"
	]
},
	"application/vnd.poc.group-advertisement+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.pocketlearn": {
	source: "iana",
	extensions: [
		"plf"
	]
},
	"application/vnd.powerbuilder6": {
	source: "iana",
	extensions: [
		"pbd"
	]
},
	"application/vnd.powerbuilder6-s": {
	source: "iana"
},
	"application/vnd.powerbuilder7": {
	source: "iana"
},
	"application/vnd.powerbuilder7-s": {
	source: "iana"
},
	"application/vnd.powerbuilder75": {
	source: "iana"
},
	"application/vnd.powerbuilder75-s": {
	source: "iana"
},
	"application/vnd.preminet": {
	source: "iana"
},
	"application/vnd.previewsystems.box": {
	source: "iana",
	extensions: [
		"box"
	]
},
	"application/vnd.procrate.brushset": {
	extensions: [
		"brushset"
	]
},
	"application/vnd.procreate.brush": {
	extensions: [
		"brush"
	]
},
	"application/vnd.procreate.dream": {
	extensions: [
		"drm"
	]
},
	"application/vnd.proteus.magazine": {
	source: "iana",
	extensions: [
		"mgz"
	]
},
	"application/vnd.psfs": {
	source: "iana"
},
	"application/vnd.pt.mundusmundi": {
	source: "iana"
},
	"application/vnd.publishare-delta-tree": {
	source: "iana",
	extensions: [
		"qps"
	]
},
	"application/vnd.pvi.ptid1": {
	source: "iana",
	extensions: [
		"ptid"
	]
},
	"application/vnd.pwg-multiplexed": {
	source: "iana"
},
	"application/vnd.pwg-xhtml-print+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xhtm"
	]
},
	"application/vnd.qualcomm.brew-app-res": {
	source: "iana"
},
	"application/vnd.quarantainenet": {
	source: "iana"
},
	"application/vnd.quark.quarkxpress": {
	source: "iana",
	extensions: [
		"qxd",
		"qxt",
		"qwd",
		"qwt",
		"qxl",
		"qxb"
	]
},
	"application/vnd.quobject-quoxdocument": {
	source: "iana"
},
	"application/vnd.radisys.moml+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-audit+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-audit-conf+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-audit-conn+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-audit-dialog+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-audit-stream+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-conf+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-base+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-fax-detect+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-group+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-speech+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.radisys.msml-dialog-transform+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.rainstor.data": {
	source: "iana"
},
	"application/vnd.rapid": {
	source: "iana"
},
	"application/vnd.rar": {
	source: "iana",
	extensions: [
		"rar"
	]
},
	"application/vnd.realvnc.bed": {
	source: "iana",
	extensions: [
		"bed"
	]
},
	"application/vnd.recordare.musicxml": {
	source: "iana",
	extensions: [
		"mxl"
	]
},
	"application/vnd.recordare.musicxml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"musicxml"
	]
},
	"application/vnd.relpipe": {
	source: "iana"
},
	"application/vnd.renlearn.rlprint": {
	source: "iana"
},
	"application/vnd.resilient.logic": {
	source: "iana"
},
	"application/vnd.restful+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.rig.cryptonote": {
	source: "iana",
	extensions: [
		"cryptonote"
	]
},
	"application/vnd.rim.cod": {
	source: "apache",
	extensions: [
		"cod"
	]
},
	"application/vnd.rn-realmedia": {
	source: "apache",
	extensions: [
		"rm"
	]
},
	"application/vnd.rn-realmedia-vbr": {
	source: "apache",
	extensions: [
		"rmvb"
	]
},
	"application/vnd.route66.link66+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"link66"
	]
},
	"application/vnd.rs-274x": {
	source: "iana"
},
	"application/vnd.ruckus.download": {
	source: "iana"
},
	"application/vnd.s3sms": {
	source: "iana"
},
	"application/vnd.sailingtracker.track": {
	source: "iana",
	extensions: [
		"st"
	]
},
	"application/vnd.sar": {
	source: "iana"
},
	"application/vnd.sbm.cid": {
	source: "iana"
},
	"application/vnd.sbm.mid2": {
	source: "iana"
},
	"application/vnd.scribus": {
	source: "iana"
},
	"application/vnd.sealed.3df": {
	source: "iana"
},
	"application/vnd.sealed.csf": {
	source: "iana"
},
	"application/vnd.sealed.doc": {
	source: "iana"
},
	"application/vnd.sealed.eml": {
	source: "iana"
},
	"application/vnd.sealed.mht": {
	source: "iana"
},
	"application/vnd.sealed.net": {
	source: "iana"
},
	"application/vnd.sealed.ppt": {
	source: "iana"
},
	"application/vnd.sealed.tiff": {
	source: "iana"
},
	"application/vnd.sealed.xls": {
	source: "iana"
},
	"application/vnd.sealedmedia.softseal.html": {
	source: "iana"
},
	"application/vnd.sealedmedia.softseal.pdf": {
	source: "iana"
},
	"application/vnd.seemail": {
	source: "iana",
	extensions: [
		"see"
	]
},
	"application/vnd.seis+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.sema": {
	source: "iana",
	extensions: [
		"sema"
	]
},
	"application/vnd.semd": {
	source: "iana",
	extensions: [
		"semd"
	]
},
	"application/vnd.semf": {
	source: "iana",
	extensions: [
		"semf"
	]
},
	"application/vnd.shade-save-file": {
	source: "iana"
},
	"application/vnd.shana.informed.formdata": {
	source: "iana",
	extensions: [
		"ifm"
	]
},
	"application/vnd.shana.informed.formtemplate": {
	source: "iana",
	extensions: [
		"itp"
	]
},
	"application/vnd.shana.informed.interchange": {
	source: "iana",
	extensions: [
		"iif"
	]
},
	"application/vnd.shana.informed.package": {
	source: "iana",
	extensions: [
		"ipk"
	]
},
	"application/vnd.shootproof+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.shopkick+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.shp": {
	source: "iana"
},
	"application/vnd.shx": {
	source: "iana"
},
	"application/vnd.sigrok.session": {
	source: "iana"
},
	"application/vnd.simtech-mindmapper": {
	source: "iana",
	extensions: [
		"twd",
		"twds"
	]
},
	"application/vnd.siren+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.sketchometry": {
	source: "iana"
},
	"application/vnd.smaf": {
	source: "iana",
	extensions: [
		"mmf"
	]
},
	"application/vnd.smart.notebook": {
	source: "iana"
},
	"application/vnd.smart.teacher": {
	source: "iana",
	extensions: [
		"teacher"
	]
},
	"application/vnd.smintio.portals.archive": {
	source: "iana"
},
	"application/vnd.snesdev-page-table": {
	source: "iana"
},
	"application/vnd.software602.filler.form+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"fo"
	]
},
	"application/vnd.software602.filler.form-xml-zip": {
	source: "iana"
},
	"application/vnd.solent.sdkm+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"sdkm",
		"sdkd"
	]
},
	"application/vnd.spotfire.dxp": {
	source: "iana",
	extensions: [
		"dxp"
	]
},
	"application/vnd.spotfire.sfs": {
	source: "iana",
	extensions: [
		"sfs"
	]
},
	"application/vnd.sqlite3": {
	source: "iana"
},
	"application/vnd.sss-cod": {
	source: "iana"
},
	"application/vnd.sss-dtf": {
	source: "iana"
},
	"application/vnd.sss-ntf": {
	source: "iana"
},
	"application/vnd.stardivision.calc": {
	source: "apache",
	extensions: [
		"sdc"
	]
},
	"application/vnd.stardivision.draw": {
	source: "apache",
	extensions: [
		"sda"
	]
},
	"application/vnd.stardivision.impress": {
	source: "apache",
	extensions: [
		"sdd"
	]
},
	"application/vnd.stardivision.math": {
	source: "apache",
	extensions: [
		"smf"
	]
},
	"application/vnd.stardivision.writer": {
	source: "apache",
	extensions: [
		"sdw",
		"vor"
	]
},
	"application/vnd.stardivision.writer-global": {
	source: "apache",
	extensions: [
		"sgl"
	]
},
	"application/vnd.stepmania.package": {
	source: "iana",
	extensions: [
		"smzip"
	]
},
	"application/vnd.stepmania.stepchart": {
	source: "iana",
	extensions: [
		"sm"
	]
},
	"application/vnd.street-stream": {
	source: "iana"
},
	"application/vnd.sun.wadl+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"wadl"
	]
},
	"application/vnd.sun.xml.calc": {
	source: "apache",
	extensions: [
		"sxc"
	]
},
	"application/vnd.sun.xml.calc.template": {
	source: "apache",
	extensions: [
		"stc"
	]
},
	"application/vnd.sun.xml.draw": {
	source: "apache",
	extensions: [
		"sxd"
	]
},
	"application/vnd.sun.xml.draw.template": {
	source: "apache",
	extensions: [
		"std"
	]
},
	"application/vnd.sun.xml.impress": {
	source: "apache",
	extensions: [
		"sxi"
	]
},
	"application/vnd.sun.xml.impress.template": {
	source: "apache",
	extensions: [
		"sti"
	]
},
	"application/vnd.sun.xml.math": {
	source: "apache",
	extensions: [
		"sxm"
	]
},
	"application/vnd.sun.xml.writer": {
	source: "apache",
	extensions: [
		"sxw"
	]
},
	"application/vnd.sun.xml.writer.global": {
	source: "apache",
	extensions: [
		"sxg"
	]
},
	"application/vnd.sun.xml.writer.template": {
	source: "apache",
	extensions: [
		"stw"
	]
},
	"application/vnd.sus-calendar": {
	source: "iana",
	extensions: [
		"sus",
		"susp"
	]
},
	"application/vnd.svd": {
	source: "iana",
	extensions: [
		"svd"
	]
},
	"application/vnd.swiftview-ics": {
	source: "iana"
},
	"application/vnd.sybyl.mol2": {
	source: "iana"
},
	"application/vnd.sycle+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.syft+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.symbian.install": {
	source: "apache",
	extensions: [
		"sis",
		"sisx"
	]
},
	"application/vnd.syncml+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"xsm"
	]
},
	"application/vnd.syncml.dm+wbxml": {
	source: "iana",
	charset: "UTF-8",
	extensions: [
		"bdm"
	]
},
	"application/vnd.syncml.dm+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"xdm"
	]
},
	"application/vnd.syncml.dm.notification": {
	source: "iana"
},
	"application/vnd.syncml.dmddf+wbxml": {
	source: "iana"
},
	"application/vnd.syncml.dmddf+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"ddf"
	]
},
	"application/vnd.syncml.dmtnds+wbxml": {
	source: "iana"
},
	"application/vnd.syncml.dmtnds+xml": {
	source: "iana",
	charset: "UTF-8",
	compressible: true
},
	"application/vnd.syncml.ds.notification": {
	source: "iana"
},
	"application/vnd.tableschema+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.tao.intent-module-archive": {
	source: "iana",
	extensions: [
		"tao"
	]
},
	"application/vnd.tcpdump.pcap": {
	source: "iana",
	extensions: [
		"pcap",
		"cap",
		"dmp"
	]
},
	"application/vnd.think-cell.ppttc+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.tmd.mediaflex.api+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.tml": {
	source: "iana"
},
	"application/vnd.tmobile-livetv": {
	source: "iana",
	extensions: [
		"tmo"
	]
},
	"application/vnd.tri.onesource": {
	source: "iana"
},
	"application/vnd.trid.tpt": {
	source: "iana",
	extensions: [
		"tpt"
	]
},
	"application/vnd.triscape.mxs": {
	source: "iana",
	extensions: [
		"mxs"
	]
},
	"application/vnd.trueapp": {
	source: "iana",
	extensions: [
		"tra"
	]
},
	"application/vnd.truedoc": {
	source: "iana"
},
	"application/vnd.ubisoft.webplayer": {
	source: "iana"
},
	"application/vnd.ufdl": {
	source: "iana",
	extensions: [
		"ufd",
		"ufdl"
	]
},
	"application/vnd.uic.osdm+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.uiq.theme": {
	source: "iana",
	extensions: [
		"utz"
	]
},
	"application/vnd.umajin": {
	source: "iana",
	extensions: [
		"umj"
	]
},
	"application/vnd.unity": {
	source: "iana",
	extensions: [
		"unityweb"
	]
},
	"application/vnd.uoml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"uoml",
		"uo"
	]
},
	"application/vnd.uplanet.alert": {
	source: "iana"
},
	"application/vnd.uplanet.alert-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.bearer-choice": {
	source: "iana"
},
	"application/vnd.uplanet.bearer-choice-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.cacheop": {
	source: "iana"
},
	"application/vnd.uplanet.cacheop-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.channel": {
	source: "iana"
},
	"application/vnd.uplanet.channel-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.list": {
	source: "iana"
},
	"application/vnd.uplanet.list-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.listcmd": {
	source: "iana"
},
	"application/vnd.uplanet.listcmd-wbxml": {
	source: "iana"
},
	"application/vnd.uplanet.signal": {
	source: "iana"
},
	"application/vnd.uri-map": {
	source: "iana"
},
	"application/vnd.valve.source.material": {
	source: "iana"
},
	"application/vnd.vcx": {
	source: "iana",
	extensions: [
		"vcx"
	]
},
	"application/vnd.vd-study": {
	source: "iana"
},
	"application/vnd.vectorworks": {
	source: "iana"
},
	"application/vnd.vel+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.veraison.tsm-report+cbor": {
	source: "iana"
},
	"application/vnd.veraison.tsm-report+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.verimatrix.vcas": {
	source: "iana"
},
	"application/vnd.veritone.aion+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.veryant.thin": {
	source: "iana"
},
	"application/vnd.ves.encrypted": {
	source: "iana"
},
	"application/vnd.vidsoft.vidconference": {
	source: "iana"
},
	"application/vnd.visio": {
	source: "iana",
	extensions: [
		"vsd",
		"vst",
		"vss",
		"vsw",
		"vsdx",
		"vtx"
	]
},
	"application/vnd.visionary": {
	source: "iana",
	extensions: [
		"vis"
	]
},
	"application/vnd.vividence.scriptfile": {
	source: "iana"
},
	"application/vnd.vocalshaper.vsp4": {
	source: "iana"
},
	"application/vnd.vsf": {
	source: "iana",
	extensions: [
		"vsf"
	]
},
	"application/vnd.wap.sic": {
	source: "iana"
},
	"application/vnd.wap.slc": {
	source: "iana"
},
	"application/vnd.wap.wbxml": {
	source: "iana",
	charset: "UTF-8",
	extensions: [
		"wbxml"
	]
},
	"application/vnd.wap.wmlc": {
	source: "iana",
	extensions: [
		"wmlc"
	]
},
	"application/vnd.wap.wmlscriptc": {
	source: "iana",
	extensions: [
		"wmlsc"
	]
},
	"application/vnd.wasmflow.wafl": {
	source: "iana"
},
	"application/vnd.webturbo": {
	source: "iana",
	extensions: [
		"wtb"
	]
},
	"application/vnd.wfa.dpp": {
	source: "iana"
},
	"application/vnd.wfa.p2p": {
	source: "iana"
},
	"application/vnd.wfa.wsc": {
	source: "iana"
},
	"application/vnd.windows.devicepairing": {
	source: "iana"
},
	"application/vnd.wmc": {
	source: "iana"
},
	"application/vnd.wmf.bootstrap": {
	source: "iana"
},
	"application/vnd.wolfram.mathematica": {
	source: "iana"
},
	"application/vnd.wolfram.mathematica.package": {
	source: "iana"
},
	"application/vnd.wolfram.player": {
	source: "iana",
	extensions: [
		"nbp"
	]
},
	"application/vnd.wordlift": {
	source: "iana"
},
	"application/vnd.wordperfect": {
	source: "iana",
	extensions: [
		"wpd"
	]
},
	"application/vnd.wqd": {
	source: "iana",
	extensions: [
		"wqd"
	]
},
	"application/vnd.wrq-hp3000-labelled": {
	source: "iana"
},
	"application/vnd.wt.stf": {
	source: "iana",
	extensions: [
		"stf"
	]
},
	"application/vnd.wv.csp+wbxml": {
	source: "iana"
},
	"application/vnd.wv.csp+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.wv.ssp+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.xacml+json": {
	source: "iana",
	compressible: true
},
	"application/vnd.xara": {
	source: "iana",
	extensions: [
		"xar"
	]
},
	"application/vnd.xarin.cpj": {
	source: "iana"
},
	"application/vnd.xecrets-encrypted": {
	source: "iana"
},
	"application/vnd.xfdl": {
	source: "iana",
	extensions: [
		"xfdl"
	]
},
	"application/vnd.xfdl.webform": {
	source: "iana"
},
	"application/vnd.xmi+xml": {
	source: "iana",
	compressible: true
},
	"application/vnd.xmpie.cpkg": {
	source: "iana"
},
	"application/vnd.xmpie.dpkg": {
	source: "iana"
},
	"application/vnd.xmpie.plan": {
	source: "iana"
},
	"application/vnd.xmpie.ppkg": {
	source: "iana"
},
	"application/vnd.xmpie.xlim": {
	source: "iana"
},
	"application/vnd.yamaha.hv-dic": {
	source: "iana",
	extensions: [
		"hvd"
	]
},
	"application/vnd.yamaha.hv-script": {
	source: "iana",
	extensions: [
		"hvs"
	]
},
	"application/vnd.yamaha.hv-voice": {
	source: "iana",
	extensions: [
		"hvp"
	]
},
	"application/vnd.yamaha.openscoreformat": {
	source: "iana",
	extensions: [
		"osf"
	]
},
	"application/vnd.yamaha.openscoreformat.osfpvg+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"osfpvg"
	]
},
	"application/vnd.yamaha.remote-setup": {
	source: "iana"
},
	"application/vnd.yamaha.smaf-audio": {
	source: "iana",
	extensions: [
		"saf"
	]
},
	"application/vnd.yamaha.smaf-phrase": {
	source: "iana",
	extensions: [
		"spf"
	]
},
	"application/vnd.yamaha.through-ngn": {
	source: "iana"
},
	"application/vnd.yamaha.tunnel-udpencap": {
	source: "iana"
},
	"application/vnd.yaoweme": {
	source: "iana"
},
	"application/vnd.yellowriver-custom-menu": {
	source: "iana",
	extensions: [
		"cmp"
	]
},
	"application/vnd.zul": {
	source: "iana",
	extensions: [
		"zir",
		"zirz"
	]
},
	"application/vnd.zzazz.deck+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"zaz"
	]
},
	"application/voicexml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"vxml"
	]
},
	"application/voucher-cms+json": {
	source: "iana",
	compressible: true
},
	"application/voucher-jws+json": {
	source: "iana",
	compressible: true
},
	"application/vp": {
	source: "iana"
},
	"application/vp+cose": {
	source: "iana"
},
	"application/vp+jwt": {
	source: "iana"
},
	"application/vq-rtcpxr": {
	source: "iana"
},
	"application/wasm": {
	source: "iana",
	compressible: true,
	extensions: [
		"wasm"
	]
},
	"application/watcherinfo+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"wif"
	]
},
	"application/webpush-options+json": {
	source: "iana",
	compressible: true
},
	"application/whoispp-query": {
	source: "iana"
},
	"application/whoispp-response": {
	source: "iana"
},
	"application/widget": {
	source: "iana",
	extensions: [
		"wgt"
	]
},
	"application/winhlp": {
	source: "apache",
	extensions: [
		"hlp"
	]
},
	"application/wita": {
	source: "iana"
},
	"application/wordperfect5.1": {
	source: "iana"
},
	"application/wsdl+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"wsdl"
	]
},
	"application/wspolicy+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"wspolicy"
	]
},
	"application/x-7z-compressed": {
	source: "apache",
	compressible: false,
	extensions: [
		"7z"
	]
},
	"application/x-abiword": {
	source: "apache",
	extensions: [
		"abw"
	]
},
	"application/x-ace-compressed": {
	source: "apache",
	extensions: [
		"ace"
	]
},
	"application/x-amf": {
	source: "apache"
},
	"application/x-apple-diskimage": {
	source: "apache",
	extensions: [
		"dmg"
	]
},
	"application/x-arj": {
	compressible: false,
	extensions: [
		"arj"
	]
},
	"application/x-authorware-bin": {
	source: "apache",
	extensions: [
		"aab",
		"x32",
		"u32",
		"vox"
	]
},
	"application/x-authorware-map": {
	source: "apache",
	extensions: [
		"aam"
	]
},
	"application/x-authorware-seg": {
	source: "apache",
	extensions: [
		"aas"
	]
},
	"application/x-bcpio": {
	source: "apache",
	extensions: [
		"bcpio"
	]
},
	"application/x-bdoc": {
	compressible: false,
	extensions: [
		"bdoc"
	]
},
	"application/x-bittorrent": {
	source: "apache",
	extensions: [
		"torrent"
	]
},
	"application/x-blender": {
	extensions: [
		"blend"
	]
},
	"application/x-blorb": {
	source: "apache",
	extensions: [
		"blb",
		"blorb"
	]
},
	"application/x-bzip": {
	source: "apache",
	compressible: false,
	extensions: [
		"bz"
	]
},
	"application/x-bzip2": {
	source: "apache",
	compressible: false,
	extensions: [
		"bz2",
		"boz"
	]
},
	"application/x-cbr": {
	source: "apache",
	extensions: [
		"cbr",
		"cba",
		"cbt",
		"cbz",
		"cb7"
	]
},
	"application/x-cdlink": {
	source: "apache",
	extensions: [
		"vcd"
	]
},
	"application/x-cfs-compressed": {
	source: "apache",
	extensions: [
		"cfs"
	]
},
	"application/x-chat": {
	source: "apache",
	extensions: [
		"chat"
	]
},
	"application/x-chess-pgn": {
	source: "apache",
	extensions: [
		"pgn"
	]
},
	"application/x-chrome-extension": {
	extensions: [
		"crx"
	]
},
	"application/x-cocoa": {
	source: "nginx",
	extensions: [
		"cco"
	]
},
	"application/x-compress": {
	source: "apache"
},
	"application/x-compressed": {
	extensions: [
		"rar"
	]
},
	"application/x-conference": {
	source: "apache",
	extensions: [
		"nsc"
	]
},
	"application/x-cpio": {
	source: "apache",
	extensions: [
		"cpio"
	]
},
	"application/x-csh": {
	source: "apache",
	extensions: [
		"csh"
	]
},
	"application/x-deb": {
	compressible: false
},
	"application/x-debian-package": {
	source: "apache",
	extensions: [
		"deb",
		"udeb"
	]
},
	"application/x-dgc-compressed": {
	source: "apache",
	extensions: [
		"dgc"
	]
},
	"application/x-director": {
	source: "apache",
	extensions: [
		"dir",
		"dcr",
		"dxr",
		"cst",
		"cct",
		"cxt",
		"w3d",
		"fgd",
		"swa"
	]
},
	"application/x-doom": {
	source: "apache",
	extensions: [
		"wad"
	]
},
	"application/x-dtbncx+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"ncx"
	]
},
	"application/x-dtbook+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"dtb"
	]
},
	"application/x-dtbresource+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"res"
	]
},
	"application/x-dvi": {
	source: "apache",
	compressible: false,
	extensions: [
		"dvi"
	]
},
	"application/x-envoy": {
	source: "apache",
	extensions: [
		"evy"
	]
},
	"application/x-eva": {
	source: "apache",
	extensions: [
		"eva"
	]
},
	"application/x-font-bdf": {
	source: "apache",
	extensions: [
		"bdf"
	]
},
	"application/x-font-dos": {
	source: "apache"
},
	"application/x-font-framemaker": {
	source: "apache"
},
	"application/x-font-ghostscript": {
	source: "apache",
	extensions: [
		"gsf"
	]
},
	"application/x-font-libgrx": {
	source: "apache"
},
	"application/x-font-linux-psf": {
	source: "apache",
	extensions: [
		"psf"
	]
},
	"application/x-font-pcf": {
	source: "apache",
	extensions: [
		"pcf"
	]
},
	"application/x-font-snf": {
	source: "apache",
	extensions: [
		"snf"
	]
},
	"application/x-font-speedo": {
	source: "apache"
},
	"application/x-font-sunos-news": {
	source: "apache"
},
	"application/x-font-type1": {
	source: "apache",
	extensions: [
		"pfa",
		"pfb",
		"pfm",
		"afm"
	]
},
	"application/x-font-vfont": {
	source: "apache"
},
	"application/x-freearc": {
	source: "apache",
	extensions: [
		"arc"
	]
},
	"application/x-futuresplash": {
	source: "apache",
	extensions: [
		"spl"
	]
},
	"application/x-gca-compressed": {
	source: "apache",
	extensions: [
		"gca"
	]
},
	"application/x-glulx": {
	source: "apache",
	extensions: [
		"ulx"
	]
},
	"application/x-gnumeric": {
	source: "apache",
	extensions: [
		"gnumeric"
	]
},
	"application/x-gramps-xml": {
	source: "apache",
	extensions: [
		"gramps"
	]
},
	"application/x-gtar": {
	source: "apache",
	extensions: [
		"gtar"
	]
},
	"application/x-gzip": {
	source: "apache"
},
	"application/x-hdf": {
	source: "apache",
	extensions: [
		"hdf"
	]
},
	"application/x-httpd-php": {
	compressible: true,
	extensions: [
		"php"
	]
},
	"application/x-install-instructions": {
	source: "apache",
	extensions: [
		"install"
	]
},
	"application/x-ipynb+json": {
	compressible: true,
	extensions: [
		"ipynb"
	]
},
	"application/x-iso9660-image": {
	source: "apache",
	extensions: [
		"iso"
	]
},
	"application/x-iwork-keynote-sffkey": {
	extensions: [
		"key"
	]
},
	"application/x-iwork-numbers-sffnumbers": {
	extensions: [
		"numbers"
	]
},
	"application/x-iwork-pages-sffpages": {
	extensions: [
		"pages"
	]
},
	"application/x-java-archive-diff": {
	source: "nginx",
	extensions: [
		"jardiff"
	]
},
	"application/x-java-jnlp-file": {
	source: "apache",
	compressible: false,
	extensions: [
		"jnlp"
	]
},
	"application/x-javascript": {
	compressible: true
},
	"application/x-keepass2": {
	extensions: [
		"kdbx"
	]
},
	"application/x-latex": {
	source: "apache",
	compressible: false,
	extensions: [
		"latex"
	]
},
	"application/x-lua-bytecode": {
	extensions: [
		"luac"
	]
},
	"application/x-lzh-compressed": {
	source: "apache",
	extensions: [
		"lzh",
		"lha"
	]
},
	"application/x-makeself": {
	source: "nginx",
	extensions: [
		"run"
	]
},
	"application/x-mie": {
	source: "apache",
	extensions: [
		"mie"
	]
},
	"application/x-mobipocket-ebook": {
	source: "apache",
	extensions: [
		"prc",
		"mobi"
	]
},
	"application/x-mpegurl": {
	compressible: false
},
	"application/x-ms-application": {
	source: "apache",
	extensions: [
		"application"
	]
},
	"application/x-ms-shortcut": {
	source: "apache",
	extensions: [
		"lnk"
	]
},
	"application/x-ms-wmd": {
	source: "apache",
	extensions: [
		"wmd"
	]
},
	"application/x-ms-wmz": {
	source: "apache",
	extensions: [
		"wmz"
	]
},
	"application/x-ms-xbap": {
	source: "apache",
	extensions: [
		"xbap"
	]
},
	"application/x-msaccess": {
	source: "apache",
	extensions: [
		"mdb"
	]
},
	"application/x-msbinder": {
	source: "apache",
	extensions: [
		"obd"
	]
},
	"application/x-mscardfile": {
	source: "apache",
	extensions: [
		"crd"
	]
},
	"application/x-msclip": {
	source: "apache",
	extensions: [
		"clp"
	]
},
	"application/x-msdos-program": {
	extensions: [
		"exe"
	]
},
	"application/x-msdownload": {
	source: "apache",
	extensions: [
		"exe",
		"dll",
		"com",
		"bat",
		"msi"
	]
},
	"application/x-msmediaview": {
	source: "apache",
	extensions: [
		"mvb",
		"m13",
		"m14"
	]
},
	"application/x-msmetafile": {
	source: "apache",
	extensions: [
		"wmf",
		"wmz",
		"emf",
		"emz"
	]
},
	"application/x-msmoney": {
	source: "apache",
	extensions: [
		"mny"
	]
},
	"application/x-mspublisher": {
	source: "apache",
	extensions: [
		"pub"
	]
},
	"application/x-msschedule": {
	source: "apache",
	extensions: [
		"scd"
	]
},
	"application/x-msterminal": {
	source: "apache",
	extensions: [
		"trm"
	]
},
	"application/x-mswrite": {
	source: "apache",
	extensions: [
		"wri"
	]
},
	"application/x-netcdf": {
	source: "apache",
	extensions: [
		"nc",
		"cdf"
	]
},
	"application/x-ns-proxy-autoconfig": {
	compressible: true,
	extensions: [
		"pac"
	]
},
	"application/x-nzb": {
	source: "apache",
	extensions: [
		"nzb"
	]
},
	"application/x-perl": {
	source: "nginx",
	extensions: [
		"pl",
		"pm"
	]
},
	"application/x-pilot": {
	source: "nginx",
	extensions: [
		"prc",
		"pdb"
	]
},
	"application/x-pkcs12": {
	source: "apache",
	compressible: false,
	extensions: [
		"p12",
		"pfx"
	]
},
	"application/x-pkcs7-certificates": {
	source: "apache",
	extensions: [
		"p7b",
		"spc"
	]
},
	"application/x-pkcs7-certreqresp": {
	source: "apache",
	extensions: [
		"p7r"
	]
},
	"application/x-pki-message": {
	source: "iana"
},
	"application/x-rar-compressed": {
	source: "apache",
	compressible: false,
	extensions: [
		"rar"
	]
},
	"application/x-redhat-package-manager": {
	source: "nginx",
	extensions: [
		"rpm"
	]
},
	"application/x-research-info-systems": {
	source: "apache",
	extensions: [
		"ris"
	]
},
	"application/x-sea": {
	source: "nginx",
	extensions: [
		"sea"
	]
},
	"application/x-sh": {
	source: "apache",
	compressible: true,
	extensions: [
		"sh"
	]
},
	"application/x-shar": {
	source: "apache",
	extensions: [
		"shar"
	]
},
	"application/x-shockwave-flash": {
	source: "apache",
	compressible: false,
	extensions: [
		"swf"
	]
},
	"application/x-silverlight-app": {
	source: "apache",
	extensions: [
		"xap"
	]
},
	"application/x-sql": {
	source: "apache",
	extensions: [
		"sql"
	]
},
	"application/x-stuffit": {
	source: "apache",
	compressible: false,
	extensions: [
		"sit"
	]
},
	"application/x-stuffitx": {
	source: "apache",
	extensions: [
		"sitx"
	]
},
	"application/x-subrip": {
	source: "apache",
	extensions: [
		"srt"
	]
},
	"application/x-sv4cpio": {
	source: "apache",
	extensions: [
		"sv4cpio"
	]
},
	"application/x-sv4crc": {
	source: "apache",
	extensions: [
		"sv4crc"
	]
},
	"application/x-t3vm-image": {
	source: "apache",
	extensions: [
		"t3"
	]
},
	"application/x-tads": {
	source: "apache",
	extensions: [
		"gam"
	]
},
	"application/x-tar": {
	source: "apache",
	compressible: true,
	extensions: [
		"tar"
	]
},
	"application/x-tcl": {
	source: "apache",
	extensions: [
		"tcl",
		"tk"
	]
},
	"application/x-tex": {
	source: "apache",
	extensions: [
		"tex"
	]
},
	"application/x-tex-tfm": {
	source: "apache",
	extensions: [
		"tfm"
	]
},
	"application/x-texinfo": {
	source: "apache",
	extensions: [
		"texinfo",
		"texi"
	]
},
	"application/x-tgif": {
	source: "apache",
	extensions: [
		"obj"
	]
},
	"application/x-ustar": {
	source: "apache",
	extensions: [
		"ustar"
	]
},
	"application/x-virtualbox-hdd": {
	compressible: true,
	extensions: [
		"hdd"
	]
},
	"application/x-virtualbox-ova": {
	compressible: true,
	extensions: [
		"ova"
	]
},
	"application/x-virtualbox-ovf": {
	compressible: true,
	extensions: [
		"ovf"
	]
},
	"application/x-virtualbox-vbox": {
	compressible: true,
	extensions: [
		"vbox"
	]
},
	"application/x-virtualbox-vbox-extpack": {
	compressible: false,
	extensions: [
		"vbox-extpack"
	]
},
	"application/x-virtualbox-vdi": {
	compressible: true,
	extensions: [
		"vdi"
	]
},
	"application/x-virtualbox-vhd": {
	compressible: true,
	extensions: [
		"vhd"
	]
},
	"application/x-virtualbox-vmdk": {
	compressible: true,
	extensions: [
		"vmdk"
	]
},
	"application/x-wais-source": {
	source: "apache",
	extensions: [
		"src"
	]
},
	"application/x-web-app-manifest+json": {
	compressible: true,
	extensions: [
		"webapp"
	]
},
	"application/x-www-form-urlencoded": {
	source: "iana",
	compressible: true
},
	"application/x-x509-ca-cert": {
	source: "iana",
	extensions: [
		"der",
		"crt",
		"pem"
	]
},
	"application/x-x509-ca-ra-cert": {
	source: "iana"
},
	"application/x-x509-next-ca-cert": {
	source: "iana"
},
	"application/x-xfig": {
	source: "apache",
	extensions: [
		"fig"
	]
},
	"application/x-xliff+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"xlf"
	]
},
	"application/x-xpinstall": {
	source: "apache",
	compressible: false,
	extensions: [
		"xpi"
	]
},
	"application/x-xz": {
	source: "apache",
	extensions: [
		"xz"
	]
},
	"application/x-zip-compressed": {
	extensions: [
		"zip"
	]
},
	"application/x-zmachine": {
	source: "apache",
	extensions: [
		"z1",
		"z2",
		"z3",
		"z4",
		"z5",
		"z6",
		"z7",
		"z8"
	]
},
	"application/x400-bp": {
	source: "iana"
},
	"application/xacml+xml": {
	source: "iana",
	compressible: true
},
	"application/xaml+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"xaml"
	]
},
	"application/xcap-att+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xav"
	]
},
	"application/xcap-caps+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xca"
	]
},
	"application/xcap-diff+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xdf"
	]
},
	"application/xcap-el+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xel"
	]
},
	"application/xcap-error+xml": {
	source: "iana",
	compressible: true
},
	"application/xcap-ns+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xns"
	]
},
	"application/xcon-conference-info+xml": {
	source: "iana",
	compressible: true
},
	"application/xcon-conference-info-diff+xml": {
	source: "iana",
	compressible: true
},
	"application/xenc+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xenc"
	]
},
	"application/xfdf": {
	source: "iana",
	extensions: [
		"xfdf"
	]
},
	"application/xhtml+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xhtml",
		"xht"
	]
},
	"application/xhtml-voice+xml": {
	source: "apache",
	compressible: true
},
	"application/xliff+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xlf"
	]
},
	"application/xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xml",
		"xsl",
		"xsd",
		"rng"
	]
},
	"application/xml-dtd": {
	source: "iana",
	compressible: true,
	extensions: [
		"dtd"
	]
},
	"application/xml-external-parsed-entity": {
	source: "iana"
},
	"application/xml-patch+xml": {
	source: "iana",
	compressible: true
},
	"application/xmpp+xml": {
	source: "iana",
	compressible: true
},
	"application/xop+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xop"
	]
},
	"application/xproc+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"xpl"
	]
},
	"application/xslt+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xsl",
		"xslt"
	]
},
	"application/xspf+xml": {
	source: "apache",
	compressible: true,
	extensions: [
		"xspf"
	]
},
	"application/xv+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"mxml",
		"xhvml",
		"xvml",
		"xvm"
	]
},
	"application/yaml": {
	source: "iana"
},
	"application/yang": {
	source: "iana",
	extensions: [
		"yang"
	]
},
	"application/yang-data+cbor": {
	source: "iana"
},
	"application/yang-data+json": {
	source: "iana",
	compressible: true
},
	"application/yang-data+xml": {
	source: "iana",
	compressible: true
},
	"application/yang-patch+json": {
	source: "iana",
	compressible: true
},
	"application/yang-patch+xml": {
	source: "iana",
	compressible: true
},
	"application/yang-sid+json": {
	source: "iana",
	compressible: true
},
	"application/yin+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"yin"
	]
},
	"application/zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"zip"
	]
},
	"application/zip+dotlottie": {
	extensions: [
		"lottie"
	]
},
	"application/zlib": {
	source: "iana"
},
	"application/zstd": {
	source: "iana"
},
	"audio/1d-interleaved-parityfec": {
	source: "iana"
},
	"audio/32kadpcm": {
	source: "iana"
},
	"audio/3gpp": {
	source: "iana",
	compressible: false,
	extensions: [
		"3gpp"
	]
},
	"audio/3gpp2": {
	source: "iana"
},
	"audio/aac": {
	source: "iana",
	extensions: [
		"adts",
		"aac"
	]
},
	"audio/ac3": {
	source: "iana"
},
	"audio/adpcm": {
	source: "apache",
	extensions: [
		"adp"
	]
},
	"audio/amr": {
	source: "iana",
	extensions: [
		"amr"
	]
},
	"audio/amr-wb": {
	source: "iana"
},
	"audio/amr-wb+": {
	source: "iana"
},
	"audio/aptx": {
	source: "iana"
},
	"audio/asc": {
	source: "iana"
},
	"audio/atrac-advanced-lossless": {
	source: "iana"
},
	"audio/atrac-x": {
	source: "iana"
},
	"audio/atrac3": {
	source: "iana"
},
	"audio/basic": {
	source: "iana",
	compressible: false,
	extensions: [
		"au",
		"snd"
	]
},
	"audio/bv16": {
	source: "iana"
},
	"audio/bv32": {
	source: "iana"
},
	"audio/clearmode": {
	source: "iana"
},
	"audio/cn": {
	source: "iana"
},
	"audio/dat12": {
	source: "iana"
},
	"audio/dls": {
	source: "iana"
},
	"audio/dsr-es201108": {
	source: "iana"
},
	"audio/dsr-es202050": {
	source: "iana"
},
	"audio/dsr-es202211": {
	source: "iana"
},
	"audio/dsr-es202212": {
	source: "iana"
},
	"audio/dv": {
	source: "iana"
},
	"audio/dvi4": {
	source: "iana"
},
	"audio/eac3": {
	source: "iana"
},
	"audio/encaprtp": {
	source: "iana"
},
	"audio/evrc": {
	source: "iana"
},
	"audio/evrc-qcp": {
	source: "iana"
},
	"audio/evrc0": {
	source: "iana"
},
	"audio/evrc1": {
	source: "iana"
},
	"audio/evrcb": {
	source: "iana"
},
	"audio/evrcb0": {
	source: "iana"
},
	"audio/evrcb1": {
	source: "iana"
},
	"audio/evrcnw": {
	source: "iana"
},
	"audio/evrcnw0": {
	source: "iana"
},
	"audio/evrcnw1": {
	source: "iana"
},
	"audio/evrcwb": {
	source: "iana"
},
	"audio/evrcwb0": {
	source: "iana"
},
	"audio/evrcwb1": {
	source: "iana"
},
	"audio/evs": {
	source: "iana"
},
	"audio/flac": {
	source: "iana"
},
	"audio/flexfec": {
	source: "iana"
},
	"audio/fwdred": {
	source: "iana"
},
	"audio/g711-0": {
	source: "iana"
},
	"audio/g719": {
	source: "iana"
},
	"audio/g722": {
	source: "iana"
},
	"audio/g7221": {
	source: "iana"
},
	"audio/g723": {
	source: "iana"
},
	"audio/g726-16": {
	source: "iana"
},
	"audio/g726-24": {
	source: "iana"
},
	"audio/g726-32": {
	source: "iana"
},
	"audio/g726-40": {
	source: "iana"
},
	"audio/g728": {
	source: "iana"
},
	"audio/g729": {
	source: "iana"
},
	"audio/g7291": {
	source: "iana"
},
	"audio/g729d": {
	source: "iana"
},
	"audio/g729e": {
	source: "iana"
},
	"audio/gsm": {
	source: "iana"
},
	"audio/gsm-efr": {
	source: "iana"
},
	"audio/gsm-hr-08": {
	source: "iana"
},
	"audio/ilbc": {
	source: "iana"
},
	"audio/ip-mr_v2.5": {
	source: "iana"
},
	"audio/isac": {
	source: "apache"
},
	"audio/l16": {
	source: "iana"
},
	"audio/l20": {
	source: "iana"
},
	"audio/l24": {
	source: "iana",
	compressible: false
},
	"audio/l8": {
	source: "iana"
},
	"audio/lpc": {
	source: "iana"
},
	"audio/matroska": {
	source: "iana"
},
	"audio/melp": {
	source: "iana"
},
	"audio/melp1200": {
	source: "iana"
},
	"audio/melp2400": {
	source: "iana"
},
	"audio/melp600": {
	source: "iana"
},
	"audio/mhas": {
	source: "iana"
},
	"audio/midi": {
	source: "apache",
	extensions: [
		"mid",
		"midi",
		"kar",
		"rmi"
	]
},
	"audio/midi-clip": {
	source: "iana"
},
	"audio/mobile-xmf": {
	source: "iana",
	extensions: [
		"mxmf"
	]
},
	"audio/mp3": {
	compressible: false,
	extensions: [
		"mp3"
	]
},
	"audio/mp4": {
	source: "iana",
	compressible: false,
	extensions: [
		"m4a",
		"mp4a",
		"m4b"
	]
},
	"audio/mp4a-latm": {
	source: "iana"
},
	"audio/mpa": {
	source: "iana"
},
	"audio/mpa-robust": {
	source: "iana"
},
	"audio/mpeg": {
	source: "iana",
	compressible: false,
	extensions: [
		"mpga",
		"mp2",
		"mp2a",
		"mp3",
		"m2a",
		"m3a"
	]
},
	"audio/mpeg4-generic": {
	source: "iana"
},
	"audio/musepack": {
	source: "apache"
},
	"audio/ogg": {
	source: "iana",
	compressible: false,
	extensions: [
		"oga",
		"ogg",
		"spx",
		"opus"
	]
},
	"audio/opus": {
	source: "iana"
},
	"audio/parityfec": {
	source: "iana"
},
	"audio/pcma": {
	source: "iana"
},
	"audio/pcma-wb": {
	source: "iana"
},
	"audio/pcmu": {
	source: "iana"
},
	"audio/pcmu-wb": {
	source: "iana"
},
	"audio/prs.sid": {
	source: "iana"
},
	"audio/qcelp": {
	source: "iana"
},
	"audio/raptorfec": {
	source: "iana"
},
	"audio/red": {
	source: "iana"
},
	"audio/rtp-enc-aescm128": {
	source: "iana"
},
	"audio/rtp-midi": {
	source: "iana"
},
	"audio/rtploopback": {
	source: "iana"
},
	"audio/rtx": {
	source: "iana"
},
	"audio/s3m": {
	source: "apache",
	extensions: [
		"s3m"
	]
},
	"audio/scip": {
	source: "iana"
},
	"audio/silk": {
	source: "apache",
	extensions: [
		"sil"
	]
},
	"audio/smv": {
	source: "iana"
},
	"audio/smv-qcp": {
	source: "iana"
},
	"audio/smv0": {
	source: "iana"
},
	"audio/sofa": {
	source: "iana"
},
	"audio/sp-midi": {
	source: "iana"
},
	"audio/speex": {
	source: "iana"
},
	"audio/t140c": {
	source: "iana"
},
	"audio/t38": {
	source: "iana"
},
	"audio/telephone-event": {
	source: "iana"
},
	"audio/tetra_acelp": {
	source: "iana"
},
	"audio/tetra_acelp_bb": {
	source: "iana"
},
	"audio/tone": {
	source: "iana"
},
	"audio/tsvcis": {
	source: "iana"
},
	"audio/uemclip": {
	source: "iana"
},
	"audio/ulpfec": {
	source: "iana"
},
	"audio/usac": {
	source: "iana"
},
	"audio/vdvi": {
	source: "iana"
},
	"audio/vmr-wb": {
	source: "iana"
},
	"audio/vnd.3gpp.iufp": {
	source: "iana"
},
	"audio/vnd.4sb": {
	source: "iana"
},
	"audio/vnd.audiokoz": {
	source: "iana"
},
	"audio/vnd.celp": {
	source: "iana"
},
	"audio/vnd.cisco.nse": {
	source: "iana"
},
	"audio/vnd.cmles.radio-events": {
	source: "iana"
},
	"audio/vnd.cns.anp1": {
	source: "iana"
},
	"audio/vnd.cns.inf1": {
	source: "iana"
},
	"audio/vnd.dece.audio": {
	source: "iana",
	extensions: [
		"uva",
		"uvva"
	]
},
	"audio/vnd.digital-winds": {
	source: "iana",
	extensions: [
		"eol"
	]
},
	"audio/vnd.dlna.adts": {
	source: "iana"
},
	"audio/vnd.dolby.heaac.1": {
	source: "iana"
},
	"audio/vnd.dolby.heaac.2": {
	source: "iana"
},
	"audio/vnd.dolby.mlp": {
	source: "iana"
},
	"audio/vnd.dolby.mps": {
	source: "iana"
},
	"audio/vnd.dolby.pl2": {
	source: "iana"
},
	"audio/vnd.dolby.pl2x": {
	source: "iana"
},
	"audio/vnd.dolby.pl2z": {
	source: "iana"
},
	"audio/vnd.dolby.pulse.1": {
	source: "iana"
},
	"audio/vnd.dra": {
	source: "iana",
	extensions: [
		"dra"
	]
},
	"audio/vnd.dts": {
	source: "iana",
	extensions: [
		"dts"
	]
},
	"audio/vnd.dts.hd": {
	source: "iana",
	extensions: [
		"dtshd"
	]
},
	"audio/vnd.dts.uhd": {
	source: "iana"
},
	"audio/vnd.dvb.file": {
	source: "iana"
},
	"audio/vnd.everad.plj": {
	source: "iana"
},
	"audio/vnd.hns.audio": {
	source: "iana"
},
	"audio/vnd.lucent.voice": {
	source: "iana",
	extensions: [
		"lvp"
	]
},
	"audio/vnd.ms-playready.media.pya": {
	source: "iana",
	extensions: [
		"pya"
	]
},
	"audio/vnd.nokia.mobile-xmf": {
	source: "iana"
},
	"audio/vnd.nortel.vbk": {
	source: "iana"
},
	"audio/vnd.nuera.ecelp4800": {
	source: "iana",
	extensions: [
		"ecelp4800"
	]
},
	"audio/vnd.nuera.ecelp7470": {
	source: "iana",
	extensions: [
		"ecelp7470"
	]
},
	"audio/vnd.nuera.ecelp9600": {
	source: "iana",
	extensions: [
		"ecelp9600"
	]
},
	"audio/vnd.octel.sbc": {
	source: "iana"
},
	"audio/vnd.presonus.multitrack": {
	source: "iana"
},
	"audio/vnd.qcelp": {
	source: "apache"
},
	"audio/vnd.rhetorex.32kadpcm": {
	source: "iana"
},
	"audio/vnd.rip": {
	source: "iana",
	extensions: [
		"rip"
	]
},
	"audio/vnd.rn-realaudio": {
	compressible: false
},
	"audio/vnd.sealedmedia.softseal.mpeg": {
	source: "iana"
},
	"audio/vnd.vmx.cvsd": {
	source: "iana"
},
	"audio/vnd.wave": {
	compressible: false
},
	"audio/vorbis": {
	source: "iana",
	compressible: false
},
	"audio/vorbis-config": {
	source: "iana"
},
	"audio/wav": {
	compressible: false,
	extensions: [
		"wav"
	]
},
	"audio/wave": {
	compressible: false,
	extensions: [
		"wav"
	]
},
	"audio/webm": {
	source: "apache",
	compressible: false,
	extensions: [
		"weba"
	]
},
	"audio/x-aac": {
	source: "apache",
	compressible: false,
	extensions: [
		"aac"
	]
},
	"audio/x-aiff": {
	source: "apache",
	extensions: [
		"aif",
		"aiff",
		"aifc"
	]
},
	"audio/x-caf": {
	source: "apache",
	compressible: false,
	extensions: [
		"caf"
	]
},
	"audio/x-flac": {
	source: "apache",
	extensions: [
		"flac"
	]
},
	"audio/x-m4a": {
	source: "nginx",
	extensions: [
		"m4a"
	]
},
	"audio/x-matroska": {
	source: "apache",
	extensions: [
		"mka"
	]
},
	"audio/x-mpegurl": {
	source: "apache",
	extensions: [
		"m3u"
	]
},
	"audio/x-ms-wax": {
	source: "apache",
	extensions: [
		"wax"
	]
},
	"audio/x-ms-wma": {
	source: "apache",
	extensions: [
		"wma"
	]
},
	"audio/x-pn-realaudio": {
	source: "apache",
	extensions: [
		"ram",
		"ra"
	]
},
	"audio/x-pn-realaudio-plugin": {
	source: "apache",
	extensions: [
		"rmp"
	]
},
	"audio/x-realaudio": {
	source: "nginx",
	extensions: [
		"ra"
	]
},
	"audio/x-tta": {
	source: "apache"
},
	"audio/x-wav": {
	source: "apache",
	extensions: [
		"wav"
	]
},
	"audio/xm": {
	source: "apache",
	extensions: [
		"xm"
	]
},
	"chemical/x-cdx": {
	source: "apache",
	extensions: [
		"cdx"
	]
},
	"chemical/x-cif": {
	source: "apache",
	extensions: [
		"cif"
	]
},
	"chemical/x-cmdf": {
	source: "apache",
	extensions: [
		"cmdf"
	]
},
	"chemical/x-cml": {
	source: "apache",
	extensions: [
		"cml"
	]
},
	"chemical/x-csml": {
	source: "apache",
	extensions: [
		"csml"
	]
},
	"chemical/x-pdb": {
	source: "apache"
},
	"chemical/x-xyz": {
	source: "apache",
	extensions: [
		"xyz"
	]
},
	"font/collection": {
	source: "iana",
	extensions: [
		"ttc"
	]
},
	"font/otf": {
	source: "iana",
	compressible: true,
	extensions: [
		"otf"
	]
},
	"font/sfnt": {
	source: "iana"
},
	"font/ttf": {
	source: "iana",
	compressible: true,
	extensions: [
		"ttf"
	]
},
	"font/woff": {
	source: "iana",
	extensions: [
		"woff"
	]
},
	"font/woff2": {
	source: "iana",
	extensions: [
		"woff2"
	]
},
	"image/aces": {
	source: "iana",
	extensions: [
		"exr"
	]
},
	"image/apng": {
	source: "iana",
	compressible: false,
	extensions: [
		"apng"
	]
},
	"image/avci": {
	source: "iana",
	extensions: [
		"avci"
	]
},
	"image/avcs": {
	source: "iana",
	extensions: [
		"avcs"
	]
},
	"image/avif": {
	source: "iana",
	compressible: false,
	extensions: [
		"avif"
	]
},
	"image/bmp": {
	source: "iana",
	compressible: true,
	extensions: [
		"bmp",
		"dib"
	]
},
	"image/cgm": {
	source: "iana",
	extensions: [
		"cgm"
	]
},
	"image/dicom-rle": {
	source: "iana",
	extensions: [
		"drle"
	]
},
	"image/dpx": {
	source: "iana",
	extensions: [
		"dpx"
	]
},
	"image/emf": {
	source: "iana",
	extensions: [
		"emf"
	]
},
	"image/fits": {
	source: "iana",
	extensions: [
		"fits"
	]
},
	"image/g3fax": {
	source: "iana",
	extensions: [
		"g3"
	]
},
	"image/gif": {
	source: "iana",
	compressible: false,
	extensions: [
		"gif"
	]
},
	"image/heic": {
	source: "iana",
	extensions: [
		"heic"
	]
},
	"image/heic-sequence": {
	source: "iana",
	extensions: [
		"heics"
	]
},
	"image/heif": {
	source: "iana",
	extensions: [
		"heif"
	]
},
	"image/heif-sequence": {
	source: "iana",
	extensions: [
		"heifs"
	]
},
	"image/hej2k": {
	source: "iana",
	extensions: [
		"hej2"
	]
},
	"image/ief": {
	source: "iana",
	extensions: [
		"ief"
	]
},
	"image/j2c": {
	source: "iana"
},
	"image/jaii": {
	source: "iana",
	extensions: [
		"jaii"
	]
},
	"image/jais": {
	source: "iana",
	extensions: [
		"jais"
	]
},
	"image/jls": {
	source: "iana",
	extensions: [
		"jls"
	]
},
	"image/jp2": {
	source: "iana",
	compressible: false,
	extensions: [
		"jp2",
		"jpg2"
	]
},
	"image/jpeg": {
	source: "iana",
	compressible: false,
	extensions: [
		"jpg",
		"jpeg",
		"jpe"
	]
},
	"image/jph": {
	source: "iana",
	extensions: [
		"jph"
	]
},
	"image/jphc": {
	source: "iana",
	extensions: [
		"jhc"
	]
},
	"image/jpm": {
	source: "iana",
	compressible: false,
	extensions: [
		"jpm",
		"jpgm"
	]
},
	"image/jpx": {
	source: "iana",
	compressible: false,
	extensions: [
		"jpx",
		"jpf"
	]
},
	"image/jxl": {
	source: "iana",
	extensions: [
		"jxl"
	]
},
	"image/jxr": {
	source: "iana",
	extensions: [
		"jxr"
	]
},
	"image/jxra": {
	source: "iana",
	extensions: [
		"jxra"
	]
},
	"image/jxrs": {
	source: "iana",
	extensions: [
		"jxrs"
	]
},
	"image/jxs": {
	source: "iana",
	extensions: [
		"jxs"
	]
},
	"image/jxsc": {
	source: "iana",
	extensions: [
		"jxsc"
	]
},
	"image/jxsi": {
	source: "iana",
	extensions: [
		"jxsi"
	]
},
	"image/jxss": {
	source: "iana",
	extensions: [
		"jxss"
	]
},
	"image/ktx": {
	source: "iana",
	extensions: [
		"ktx"
	]
},
	"image/ktx2": {
	source: "iana",
	extensions: [
		"ktx2"
	]
},
	"image/naplps": {
	source: "iana"
},
	"image/pjpeg": {
	compressible: false,
	extensions: [
		"jfif"
	]
},
	"image/png": {
	source: "iana",
	compressible: false,
	extensions: [
		"png"
	]
},
	"image/prs.btif": {
	source: "iana",
	extensions: [
		"btif",
		"btf"
	]
},
	"image/prs.pti": {
	source: "iana",
	extensions: [
		"pti"
	]
},
	"image/pwg-raster": {
	source: "iana"
},
	"image/sgi": {
	source: "apache",
	extensions: [
		"sgi"
	]
},
	"image/svg+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"svg",
		"svgz"
	]
},
	"image/t38": {
	source: "iana",
	extensions: [
		"t38"
	]
},
	"image/tiff": {
	source: "iana",
	compressible: false,
	extensions: [
		"tif",
		"tiff"
	]
},
	"image/tiff-fx": {
	source: "iana",
	extensions: [
		"tfx"
	]
},
	"image/vnd.adobe.photoshop": {
	source: "iana",
	compressible: true,
	extensions: [
		"psd"
	]
},
	"image/vnd.airzip.accelerator.azv": {
	source: "iana",
	extensions: [
		"azv"
	]
},
	"image/vnd.clip": {
	source: "iana"
},
	"image/vnd.cns.inf2": {
	source: "iana"
},
	"image/vnd.dece.graphic": {
	source: "iana",
	extensions: [
		"uvi",
		"uvvi",
		"uvg",
		"uvvg"
	]
},
	"image/vnd.djvu": {
	source: "iana",
	extensions: [
		"djvu",
		"djv"
	]
},
	"image/vnd.dvb.subtitle": {
	source: "iana",
	extensions: [
		"sub"
	]
},
	"image/vnd.dwg": {
	source: "iana",
	extensions: [
		"dwg"
	]
},
	"image/vnd.dxf": {
	source: "iana",
	extensions: [
		"dxf"
	]
},
	"image/vnd.fastbidsheet": {
	source: "iana",
	extensions: [
		"fbs"
	]
},
	"image/vnd.fpx": {
	source: "iana",
	extensions: [
		"fpx"
	]
},
	"image/vnd.fst": {
	source: "iana",
	extensions: [
		"fst"
	]
},
	"image/vnd.fujixerox.edmics-mmr": {
	source: "iana",
	extensions: [
		"mmr"
	]
},
	"image/vnd.fujixerox.edmics-rlc": {
	source: "iana",
	extensions: [
		"rlc"
	]
},
	"image/vnd.globalgraphics.pgb": {
	source: "iana"
},
	"image/vnd.microsoft.icon": {
	source: "iana",
	compressible: true,
	extensions: [
		"ico"
	]
},
	"image/vnd.mix": {
	source: "iana"
},
	"image/vnd.mozilla.apng": {
	source: "iana"
},
	"image/vnd.ms-dds": {
	compressible: true,
	extensions: [
		"dds"
	]
},
	"image/vnd.ms-modi": {
	source: "iana",
	extensions: [
		"mdi"
	]
},
	"image/vnd.ms-photo": {
	source: "apache",
	extensions: [
		"wdp"
	]
},
	"image/vnd.net-fpx": {
	source: "iana",
	extensions: [
		"npx"
	]
},
	"image/vnd.pco.b16": {
	source: "iana",
	extensions: [
		"b16"
	]
},
	"image/vnd.radiance": {
	source: "iana"
},
	"image/vnd.sealed.png": {
	source: "iana"
},
	"image/vnd.sealedmedia.softseal.gif": {
	source: "iana"
},
	"image/vnd.sealedmedia.softseal.jpg": {
	source: "iana"
},
	"image/vnd.svf": {
	source: "iana"
},
	"image/vnd.tencent.tap": {
	source: "iana",
	extensions: [
		"tap"
	]
},
	"image/vnd.valve.source.texture": {
	source: "iana",
	extensions: [
		"vtf"
	]
},
	"image/vnd.wap.wbmp": {
	source: "iana",
	extensions: [
		"wbmp"
	]
},
	"image/vnd.xiff": {
	source: "iana",
	extensions: [
		"xif"
	]
},
	"image/vnd.zbrush.pcx": {
	source: "iana",
	extensions: [
		"pcx"
	]
},
	"image/webp": {
	source: "iana",
	extensions: [
		"webp"
	]
},
	"image/wmf": {
	source: "iana",
	extensions: [
		"wmf"
	]
},
	"image/x-3ds": {
	source: "apache",
	extensions: [
		"3ds"
	]
},
	"image/x-adobe-dng": {
	extensions: [
		"dng"
	]
},
	"image/x-cmu-raster": {
	source: "apache",
	extensions: [
		"ras"
	]
},
	"image/x-cmx": {
	source: "apache",
	extensions: [
		"cmx"
	]
},
	"image/x-emf": {
	source: "iana"
},
	"image/x-freehand": {
	source: "apache",
	extensions: [
		"fh",
		"fhc",
		"fh4",
		"fh5",
		"fh7"
	]
},
	"image/x-icon": {
	source: "apache",
	compressible: true,
	extensions: [
		"ico"
	]
},
	"image/x-jng": {
	source: "nginx",
	extensions: [
		"jng"
	]
},
	"image/x-mrsid-image": {
	source: "apache",
	extensions: [
		"sid"
	]
},
	"image/x-ms-bmp": {
	source: "nginx",
	compressible: true,
	extensions: [
		"bmp"
	]
},
	"image/x-pcx": {
	source: "apache",
	extensions: [
		"pcx"
	]
},
	"image/x-pict": {
	source: "apache",
	extensions: [
		"pic",
		"pct"
	]
},
	"image/x-portable-anymap": {
	source: "apache",
	extensions: [
		"pnm"
	]
},
	"image/x-portable-bitmap": {
	source: "apache",
	extensions: [
		"pbm"
	]
},
	"image/x-portable-graymap": {
	source: "apache",
	extensions: [
		"pgm"
	]
},
	"image/x-portable-pixmap": {
	source: "apache",
	extensions: [
		"ppm"
	]
},
	"image/x-rgb": {
	source: "apache",
	extensions: [
		"rgb"
	]
},
	"image/x-tga": {
	source: "apache",
	extensions: [
		"tga"
	]
},
	"image/x-wmf": {
	source: "iana"
},
	"image/x-xbitmap": {
	source: "apache",
	extensions: [
		"xbm"
	]
},
	"image/x-xcf": {
	compressible: false
},
	"image/x-xpixmap": {
	source: "apache",
	extensions: [
		"xpm"
	]
},
	"image/x-xwindowdump": {
	source: "apache",
	extensions: [
		"xwd"
	]
},
	"message/bhttp": {
	source: "iana"
},
	"message/cpim": {
	source: "iana"
},
	"message/delivery-status": {
	source: "iana"
},
	"message/disposition-notification": {
	source: "iana",
	extensions: [
		"disposition-notification"
	]
},
	"message/external-body": {
	source: "iana"
},
	"message/feedback-report": {
	source: "iana"
},
	"message/global": {
	source: "iana",
	extensions: [
		"u8msg"
	]
},
	"message/global-delivery-status": {
	source: "iana",
	extensions: [
		"u8dsn"
	]
},
	"message/global-disposition-notification": {
	source: "iana",
	extensions: [
		"u8mdn"
	]
},
	"message/global-headers": {
	source: "iana",
	extensions: [
		"u8hdr"
	]
},
	"message/http": {
	source: "iana",
	compressible: false
},
	"message/imdn+xml": {
	source: "iana",
	compressible: true
},
	"message/mls": {
	source: "iana"
},
	"message/news": {
	source: "apache"
},
	"message/ohttp-req": {
	source: "iana"
},
	"message/ohttp-res": {
	source: "iana"
},
	"message/partial": {
	source: "iana",
	compressible: false
},
	"message/rfc822": {
	source: "iana",
	compressible: true,
	extensions: [
		"eml",
		"mime",
		"mht",
		"mhtml"
	]
},
	"message/s-http": {
	source: "apache"
},
	"message/sip": {
	source: "iana"
},
	"message/sipfrag": {
	source: "iana"
},
	"message/tracking-status": {
	source: "iana"
},
	"message/vnd.si.simp": {
	source: "apache"
},
	"message/vnd.wfa.wsc": {
	source: "iana",
	extensions: [
		"wsc"
	]
},
	"model/3mf": {
	source: "iana",
	extensions: [
		"3mf"
	]
},
	"model/e57": {
	source: "iana"
},
	"model/gltf+json": {
	source: "iana",
	compressible: true,
	extensions: [
		"gltf"
	]
},
	"model/gltf-binary": {
	source: "iana",
	compressible: true,
	extensions: [
		"glb"
	]
},
	"model/iges": {
	source: "iana",
	compressible: false,
	extensions: [
		"igs",
		"iges"
	]
},
	"model/jt": {
	source: "iana",
	extensions: [
		"jt"
	]
},
	"model/mesh": {
	source: "iana",
	compressible: false,
	extensions: [
		"msh",
		"mesh",
		"silo"
	]
},
	"model/mtl": {
	source: "iana",
	extensions: [
		"mtl"
	]
},
	"model/obj": {
	source: "iana",
	extensions: [
		"obj"
	]
},
	"model/prc": {
	source: "iana",
	extensions: [
		"prc"
	]
},
	"model/step": {
	source: "iana",
	extensions: [
		"step",
		"stp",
		"stpnc",
		"p21",
		"210"
	]
},
	"model/step+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"stpx"
	]
},
	"model/step+zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"stpz"
	]
},
	"model/step-xml+zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"stpxz"
	]
},
	"model/stl": {
	source: "iana",
	extensions: [
		"stl"
	]
},
	"model/u3d": {
	source: "iana",
	extensions: [
		"u3d"
	]
},
	"model/vnd.bary": {
	source: "iana",
	extensions: [
		"bary"
	]
},
	"model/vnd.cld": {
	source: "iana",
	extensions: [
		"cld"
	]
},
	"model/vnd.collada+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"dae"
	]
},
	"model/vnd.dwf": {
	source: "iana",
	extensions: [
		"dwf"
	]
},
	"model/vnd.flatland.3dml": {
	source: "iana"
},
	"model/vnd.gdl": {
	source: "iana",
	extensions: [
		"gdl"
	]
},
	"model/vnd.gs-gdl": {
	source: "apache"
},
	"model/vnd.gs.gdl": {
	source: "iana"
},
	"model/vnd.gtw": {
	source: "iana",
	extensions: [
		"gtw"
	]
},
	"model/vnd.moml+xml": {
	source: "iana",
	compressible: true
},
	"model/vnd.mts": {
	source: "iana",
	extensions: [
		"mts"
	]
},
	"model/vnd.opengex": {
	source: "iana",
	extensions: [
		"ogex"
	]
},
	"model/vnd.parasolid.transmit.binary": {
	source: "iana",
	extensions: [
		"x_b"
	]
},
	"model/vnd.parasolid.transmit.text": {
	source: "iana",
	extensions: [
		"x_t"
	]
},
	"model/vnd.pytha.pyox": {
	source: "iana",
	extensions: [
		"pyo",
		"pyox"
	]
},
	"model/vnd.rosette.annotated-data-model": {
	source: "iana"
},
	"model/vnd.sap.vds": {
	source: "iana",
	extensions: [
		"vds"
	]
},
	"model/vnd.usda": {
	source: "iana",
	extensions: [
		"usda"
	]
},
	"model/vnd.usdz+zip": {
	source: "iana",
	compressible: false,
	extensions: [
		"usdz"
	]
},
	"model/vnd.valve.source.compiled-map": {
	source: "iana",
	extensions: [
		"bsp"
	]
},
	"model/vnd.vtu": {
	source: "iana",
	extensions: [
		"vtu"
	]
},
	"model/vrml": {
	source: "iana",
	compressible: false,
	extensions: [
		"wrl",
		"vrml"
	]
},
	"model/x3d+binary": {
	source: "apache",
	compressible: false,
	extensions: [
		"x3db",
		"x3dbz"
	]
},
	"model/x3d+fastinfoset": {
	source: "iana",
	extensions: [
		"x3db"
	]
},
	"model/x3d+vrml": {
	source: "apache",
	compressible: false,
	extensions: [
		"x3dv",
		"x3dvz"
	]
},
	"model/x3d+xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"x3d",
		"x3dz"
	]
},
	"model/x3d-vrml": {
	source: "iana",
	extensions: [
		"x3dv"
	]
},
	"multipart/alternative": {
	source: "iana",
	compressible: false
},
	"multipart/appledouble": {
	source: "iana"
},
	"multipart/byteranges": {
	source: "iana"
},
	"multipart/digest": {
	source: "iana"
},
	"multipart/encrypted": {
	source: "iana",
	compressible: false
},
	"multipart/form-data": {
	source: "iana",
	compressible: false
},
	"multipart/header-set": {
	source: "iana"
},
	"multipart/mixed": {
	source: "iana"
},
	"multipart/multilingual": {
	source: "iana"
},
	"multipart/parallel": {
	source: "iana"
},
	"multipart/related": {
	source: "iana",
	compressible: false
},
	"multipart/report": {
	source: "iana"
},
	"multipart/signed": {
	source: "iana",
	compressible: false
},
	"multipart/vnd.bint.med-plus": {
	source: "iana"
},
	"multipart/voice-message": {
	source: "iana"
},
	"multipart/x-mixed-replace": {
	source: "iana"
},
	"text/1d-interleaved-parityfec": {
	source: "iana"
},
	"text/cache-manifest": {
	source: "iana",
	compressible: true,
	extensions: [
		"appcache",
		"manifest"
	]
},
	"text/calendar": {
	source: "iana",
	extensions: [
		"ics",
		"ifb"
	]
},
	"text/calender": {
	compressible: true
},
	"text/cmd": {
	compressible: true
},
	"text/coffeescript": {
	extensions: [
		"coffee",
		"litcoffee"
	]
},
	"text/cql": {
	source: "iana"
},
	"text/cql-expression": {
	source: "iana"
},
	"text/cql-identifier": {
	source: "iana"
},
	"text/css": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"css"
	]
},
	"text/csv": {
	source: "iana",
	compressible: true,
	extensions: [
		"csv"
	]
},
	"text/csv-schema": {
	source: "iana"
},
	"text/directory": {
	source: "iana"
},
	"text/dns": {
	source: "iana"
},
	"text/ecmascript": {
	source: "apache"
},
	"text/encaprtp": {
	source: "iana"
},
	"text/enriched": {
	source: "iana"
},
	"text/fhirpath": {
	source: "iana"
},
	"text/flexfec": {
	source: "iana"
},
	"text/fwdred": {
	source: "iana"
},
	"text/gff3": {
	source: "iana"
},
	"text/grammar-ref-list": {
	source: "iana"
},
	"text/hl7v2": {
	source: "iana"
},
	"text/html": {
	source: "iana",
	compressible: true,
	extensions: [
		"html",
		"htm",
		"shtml"
	]
},
	"text/jade": {
	extensions: [
		"jade"
	]
},
	"text/javascript": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"js",
		"mjs"
	]
},
	"text/jcr-cnd": {
	source: "iana"
},
	"text/jsx": {
	compressible: true,
	extensions: [
		"jsx"
	]
},
	"text/less": {
	compressible: true,
	extensions: [
		"less"
	]
},
	"text/markdown": {
	source: "iana",
	compressible: true,
	extensions: [
		"md",
		"markdown"
	]
},
	"text/mathml": {
	source: "nginx",
	extensions: [
		"mml"
	]
},
	"text/mdx": {
	compressible: true,
	extensions: [
		"mdx"
	]
},
	"text/mizar": {
	source: "iana"
},
	"text/n3": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"n3"
	]
},
	"text/parameters": {
	source: "iana",
	charset: "UTF-8"
},
	"text/parityfec": {
	source: "iana"
},
	"text/plain": {
	source: "iana",
	compressible: true,
	extensions: [
		"txt",
		"text",
		"conf",
		"def",
		"list",
		"log",
		"in",
		"ini"
	]
},
	"text/provenance-notation": {
	source: "iana",
	charset: "UTF-8"
},
	"text/prs.fallenstein.rst": {
	source: "iana"
},
	"text/prs.lines.tag": {
	source: "iana",
	extensions: [
		"dsc"
	]
},
	"text/prs.prop.logic": {
	source: "iana"
},
	"text/prs.texi": {
	source: "iana"
},
	"text/raptorfec": {
	source: "iana"
},
	"text/red": {
	source: "iana"
},
	"text/rfc822-headers": {
	source: "iana"
},
	"text/richtext": {
	source: "iana",
	compressible: true,
	extensions: [
		"rtx"
	]
},
	"text/rtf": {
	source: "iana",
	compressible: true,
	extensions: [
		"rtf"
	]
},
	"text/rtp-enc-aescm128": {
	source: "iana"
},
	"text/rtploopback": {
	source: "iana"
},
	"text/rtx": {
	source: "iana"
},
	"text/sgml": {
	source: "iana",
	extensions: [
		"sgml",
		"sgm"
	]
},
	"text/shaclc": {
	source: "iana"
},
	"text/shex": {
	source: "iana",
	extensions: [
		"shex"
	]
},
	"text/slim": {
	extensions: [
		"slim",
		"slm"
	]
},
	"text/spdx": {
	source: "iana",
	extensions: [
		"spdx"
	]
},
	"text/strings": {
	source: "iana"
},
	"text/stylus": {
	extensions: [
		"stylus",
		"styl"
	]
},
	"text/t140": {
	source: "iana"
},
	"text/tab-separated-values": {
	source: "iana",
	compressible: true,
	extensions: [
		"tsv"
	]
},
	"text/troff": {
	source: "iana",
	extensions: [
		"t",
		"tr",
		"roff",
		"man",
		"me",
		"ms"
	]
},
	"text/turtle": {
	source: "iana",
	charset: "UTF-8",
	extensions: [
		"ttl"
	]
},
	"text/ulpfec": {
	source: "iana"
},
	"text/uri-list": {
	source: "iana",
	compressible: true,
	extensions: [
		"uri",
		"uris",
		"urls"
	]
},
	"text/vcard": {
	source: "iana",
	compressible: true,
	extensions: [
		"vcard"
	]
},
	"text/vnd.a": {
	source: "iana"
},
	"text/vnd.abc": {
	source: "iana"
},
	"text/vnd.ascii-art": {
	source: "iana"
},
	"text/vnd.curl": {
	source: "iana",
	extensions: [
		"curl"
	]
},
	"text/vnd.curl.dcurl": {
	source: "apache",
	extensions: [
		"dcurl"
	]
},
	"text/vnd.curl.mcurl": {
	source: "apache",
	extensions: [
		"mcurl"
	]
},
	"text/vnd.curl.scurl": {
	source: "apache",
	extensions: [
		"scurl"
	]
},
	"text/vnd.debian.copyright": {
	source: "iana",
	charset: "UTF-8"
},
	"text/vnd.dmclientscript": {
	source: "iana"
},
	"text/vnd.dvb.subtitle": {
	source: "iana",
	extensions: [
		"sub"
	]
},
	"text/vnd.esmertec.theme-descriptor": {
	source: "iana",
	charset: "UTF-8"
},
	"text/vnd.exchangeable": {
	source: "iana"
},
	"text/vnd.familysearch.gedcom": {
	source: "iana",
	extensions: [
		"ged"
	]
},
	"text/vnd.ficlab.flt": {
	source: "iana"
},
	"text/vnd.fly": {
	source: "iana",
	extensions: [
		"fly"
	]
},
	"text/vnd.fmi.flexstor": {
	source: "iana",
	extensions: [
		"flx"
	]
},
	"text/vnd.gml": {
	source: "iana"
},
	"text/vnd.graphviz": {
	source: "iana",
	extensions: [
		"gv"
	]
},
	"text/vnd.hans": {
	source: "iana"
},
	"text/vnd.hgl": {
	source: "iana"
},
	"text/vnd.in3d.3dml": {
	source: "iana",
	extensions: [
		"3dml"
	]
},
	"text/vnd.in3d.spot": {
	source: "iana",
	extensions: [
		"spot"
	]
},
	"text/vnd.iptc.newsml": {
	source: "iana"
},
	"text/vnd.iptc.nitf": {
	source: "iana"
},
	"text/vnd.latex-z": {
	source: "iana"
},
	"text/vnd.motorola.reflex": {
	source: "iana"
},
	"text/vnd.ms-mediapackage": {
	source: "iana"
},
	"text/vnd.net2phone.commcenter.command": {
	source: "iana"
},
	"text/vnd.radisys.msml-basic-layout": {
	source: "iana"
},
	"text/vnd.senx.warpscript": {
	source: "iana"
},
	"text/vnd.si.uricatalogue": {
	source: "apache"
},
	"text/vnd.sosi": {
	source: "iana"
},
	"text/vnd.sun.j2me.app-descriptor": {
	source: "iana",
	charset: "UTF-8",
	extensions: [
		"jad"
	]
},
	"text/vnd.trolltech.linguist": {
	source: "iana",
	charset: "UTF-8"
},
	"text/vnd.vcf": {
	source: "iana"
},
	"text/vnd.wap.si": {
	source: "iana"
},
	"text/vnd.wap.sl": {
	source: "iana"
},
	"text/vnd.wap.wml": {
	source: "iana",
	extensions: [
		"wml"
	]
},
	"text/vnd.wap.wmlscript": {
	source: "iana",
	extensions: [
		"wmls"
	]
},
	"text/vnd.zoo.kcl": {
	source: "iana"
},
	"text/vtt": {
	source: "iana",
	charset: "UTF-8",
	compressible: true,
	extensions: [
		"vtt"
	]
},
	"text/wgsl": {
	source: "iana",
	extensions: [
		"wgsl"
	]
},
	"text/x-asm": {
	source: "apache",
	extensions: [
		"s",
		"asm"
	]
},
	"text/x-c": {
	source: "apache",
	extensions: [
		"c",
		"cc",
		"cxx",
		"cpp",
		"h",
		"hh",
		"dic"
	]
},
	"text/x-component": {
	source: "nginx",
	extensions: [
		"htc"
	]
},
	"text/x-fortran": {
	source: "apache",
	extensions: [
		"f",
		"for",
		"f77",
		"f90"
	]
},
	"text/x-gwt-rpc": {
	compressible: true
},
	"text/x-handlebars-template": {
	extensions: [
		"hbs"
	]
},
	"text/x-java-source": {
	source: "apache",
	extensions: [
		"java"
	]
},
	"text/x-jquery-tmpl": {
	compressible: true
},
	"text/x-lua": {
	extensions: [
		"lua"
	]
},
	"text/x-markdown": {
	compressible: true,
	extensions: [
		"mkd"
	]
},
	"text/x-nfo": {
	source: "apache",
	extensions: [
		"nfo"
	]
},
	"text/x-opml": {
	source: "apache",
	extensions: [
		"opml"
	]
},
	"text/x-org": {
	compressible: true,
	extensions: [
		"org"
	]
},
	"text/x-pascal": {
	source: "apache",
	extensions: [
		"p",
		"pas"
	]
},
	"text/x-processing": {
	compressible: true,
	extensions: [
		"pde"
	]
},
	"text/x-sass": {
	extensions: [
		"sass"
	]
},
	"text/x-scss": {
	extensions: [
		"scss"
	]
},
	"text/x-setext": {
	source: "apache",
	extensions: [
		"etx"
	]
},
	"text/x-sfv": {
	source: "apache",
	extensions: [
		"sfv"
	]
},
	"text/x-suse-ymp": {
	compressible: true,
	extensions: [
		"ymp"
	]
},
	"text/x-uuencode": {
	source: "apache",
	extensions: [
		"uu"
	]
},
	"text/x-vcalendar": {
	source: "apache",
	extensions: [
		"vcs"
	]
},
	"text/x-vcard": {
	source: "apache",
	extensions: [
		"vcf"
	]
},
	"text/xml": {
	source: "iana",
	compressible: true,
	extensions: [
		"xml"
	]
},
	"text/xml-external-parsed-entity": {
	source: "iana"
},
	"text/yaml": {
	compressible: true,
	extensions: [
		"yaml",
		"yml"
	]
},
	"video/1d-interleaved-parityfec": {
	source: "iana"
},
	"video/3gpp": {
	source: "iana",
	extensions: [
		"3gp",
		"3gpp"
	]
},
	"video/3gpp-tt": {
	source: "iana"
},
	"video/3gpp2": {
	source: "iana",
	extensions: [
		"3g2"
	]
},
	"video/av1": {
	source: "iana"
},
	"video/bmpeg": {
	source: "iana"
},
	"video/bt656": {
	source: "iana"
},
	"video/celb": {
	source: "iana"
},
	"video/dv": {
	source: "iana"
},
	"video/encaprtp": {
	source: "iana"
},
	"video/evc": {
	source: "iana"
},
	"video/ffv1": {
	source: "iana"
},
	"video/flexfec": {
	source: "iana"
},
	"video/h261": {
	source: "iana",
	extensions: [
		"h261"
	]
},
	"video/h263": {
	source: "iana",
	extensions: [
		"h263"
	]
},
	"video/h263-1998": {
	source: "iana"
},
	"video/h263-2000": {
	source: "iana"
},
	"video/h264": {
	source: "iana",
	extensions: [
		"h264"
	]
},
	"video/h264-rcdo": {
	source: "iana"
},
	"video/h264-svc": {
	source: "iana"
},
	"video/h265": {
	source: "iana"
},
	"video/h266": {
	source: "iana"
},
	"video/iso.segment": {
	source: "iana",
	extensions: [
		"m4s"
	]
},
	"video/jpeg": {
	source: "iana",
	extensions: [
		"jpgv"
	]
},
	"video/jpeg2000": {
	source: "iana"
},
	"video/jpm": {
	source: "apache",
	extensions: [
		"jpm",
		"jpgm"
	]
},
	"video/jxsv": {
	source: "iana"
},
	"video/lottie+json": {
	source: "iana",
	compressible: true
},
	"video/matroska": {
	source: "iana"
},
	"video/matroska-3d": {
	source: "iana"
},
	"video/mj2": {
	source: "iana",
	extensions: [
		"mj2",
		"mjp2"
	]
},
	"video/mp1s": {
	source: "iana"
},
	"video/mp2p": {
	source: "iana"
},
	"video/mp2t": {
	source: "iana",
	extensions: [
		"ts",
		"m2t",
		"m2ts",
		"mts"
	]
},
	"video/mp4": {
	source: "iana",
	compressible: false,
	extensions: [
		"mp4",
		"mp4v",
		"mpg4"
	]
},
	"video/mp4v-es": {
	source: "iana"
},
	"video/mpeg": {
	source: "iana",
	compressible: false,
	extensions: [
		"mpeg",
		"mpg",
		"mpe",
		"m1v",
		"m2v"
	]
},
	"video/mpeg4-generic": {
	source: "iana"
},
	"video/mpv": {
	source: "iana"
},
	"video/nv": {
	source: "iana"
},
	"video/ogg": {
	source: "iana",
	compressible: false,
	extensions: [
		"ogv"
	]
},
	"video/parityfec": {
	source: "iana"
},
	"video/pointer": {
	source: "iana"
},
	"video/quicktime": {
	source: "iana",
	compressible: false,
	extensions: [
		"qt",
		"mov"
	]
},
	"video/raptorfec": {
	source: "iana"
},
	"video/raw": {
	source: "iana"
},
	"video/rtp-enc-aescm128": {
	source: "iana"
},
	"video/rtploopback": {
	source: "iana"
},
	"video/rtx": {
	source: "iana"
},
	"video/scip": {
	source: "iana"
},
	"video/smpte291": {
	source: "iana"
},
	"video/smpte292m": {
	source: "iana"
},
	"video/ulpfec": {
	source: "iana"
},
	"video/vc1": {
	source: "iana"
},
	"video/vc2": {
	source: "iana"
},
	"video/vnd.cctv": {
	source: "iana"
},
	"video/vnd.dece.hd": {
	source: "iana",
	extensions: [
		"uvh",
		"uvvh"
	]
},
	"video/vnd.dece.mobile": {
	source: "iana",
	extensions: [
		"uvm",
		"uvvm"
	]
},
	"video/vnd.dece.mp4": {
	source: "iana"
},
	"video/vnd.dece.pd": {
	source: "iana",
	extensions: [
		"uvp",
		"uvvp"
	]
},
	"video/vnd.dece.sd": {
	source: "iana",
	extensions: [
		"uvs",
		"uvvs"
	]
},
	"video/vnd.dece.video": {
	source: "iana",
	extensions: [
		"uvv",
		"uvvv"
	]
},
	"video/vnd.directv.mpeg": {
	source: "iana"
},
	"video/vnd.directv.mpeg-tts": {
	source: "iana"
},
	"video/vnd.dlna.mpeg-tts": {
	source: "iana"
},
	"video/vnd.dvb.file": {
	source: "iana",
	extensions: [
		"dvb"
	]
},
	"video/vnd.fvt": {
	source: "iana",
	extensions: [
		"fvt"
	]
},
	"video/vnd.hns.video": {
	source: "iana"
},
	"video/vnd.iptvforum.1dparityfec-1010": {
	source: "iana"
},
	"video/vnd.iptvforum.1dparityfec-2005": {
	source: "iana"
},
	"video/vnd.iptvforum.2dparityfec-1010": {
	source: "iana"
},
	"video/vnd.iptvforum.2dparityfec-2005": {
	source: "iana"
},
	"video/vnd.iptvforum.ttsavc": {
	source: "iana"
},
	"video/vnd.iptvforum.ttsmpeg2": {
	source: "iana"
},
	"video/vnd.motorola.video": {
	source: "iana"
},
	"video/vnd.motorola.videop": {
	source: "iana"
},
	"video/vnd.mpegurl": {
	source: "iana",
	extensions: [
		"mxu",
		"m4u"
	]
},
	"video/vnd.ms-playready.media.pyv": {
	source: "iana",
	extensions: [
		"pyv"
	]
},
	"video/vnd.nokia.interleaved-multimedia": {
	source: "iana"
},
	"video/vnd.nokia.mp4vr": {
	source: "iana"
},
	"video/vnd.nokia.videovoip": {
	source: "iana"
},
	"video/vnd.objectvideo": {
	source: "iana"
},
	"video/vnd.planar": {
	source: "iana"
},
	"video/vnd.radgamettools.bink": {
	source: "iana"
},
	"video/vnd.radgamettools.smacker": {
	source: "apache"
},
	"video/vnd.sealed.mpeg1": {
	source: "iana"
},
	"video/vnd.sealed.mpeg4": {
	source: "iana"
},
	"video/vnd.sealed.swf": {
	source: "iana"
},
	"video/vnd.sealedmedia.softseal.mov": {
	source: "iana"
},
	"video/vnd.uvvu.mp4": {
	source: "iana",
	extensions: [
		"uvu",
		"uvvu"
	]
},
	"video/vnd.vivo": {
	source: "iana",
	extensions: [
		"viv"
	]
},
	"video/vnd.youtube.yt": {
	source: "iana"
},
	"video/vp8": {
	source: "iana"
},
	"video/vp9": {
	source: "iana"
},
	"video/webm": {
	source: "apache",
	compressible: false,
	extensions: [
		"webm"
	]
},
	"video/x-f4v": {
	source: "apache",
	extensions: [
		"f4v"
	]
},
	"video/x-fli": {
	source: "apache",
	extensions: [
		"fli"
	]
},
	"video/x-flv": {
	source: "apache",
	compressible: false,
	extensions: [
		"flv"
	]
},
	"video/x-m4v": {
	source: "apache",
	extensions: [
		"m4v"
	]
},
	"video/x-matroska": {
	source: "apache",
	compressible: false,
	extensions: [
		"mkv",
		"mk3d",
		"mks"
	]
},
	"video/x-mng": {
	source: "apache",
	extensions: [
		"mng"
	]
},
	"video/x-ms-asf": {
	source: "apache",
	extensions: [
		"asf",
		"asx"
	]
},
	"video/x-ms-vob": {
	source: "apache",
	extensions: [
		"vob"
	]
},
	"video/x-ms-wm": {
	source: "apache",
	extensions: [
		"wm"
	]
},
	"video/x-ms-wmv": {
	source: "apache",
	compressible: false,
	extensions: [
		"wmv"
	]
},
	"video/x-ms-wmx": {
	source: "apache",
	extensions: [
		"wmx"
	]
},
	"video/x-ms-wvx": {
	source: "apache",
	extensions: [
		"wvx"
	]
},
	"video/x-msvideo": {
	source: "apache",
	extensions: [
		"avi"
	]
},
	"video/x-sgi-movie": {
	source: "apache",
	extensions: [
		"movie"
	]
},
	"video/x-smv": {
	source: "apache",
	extensions: [
		"smv"
	]
},
	"x-conference/x-cooltalk": {
	source: "apache",
	extensions: [
		"ice"
	]
},
	"x-shader/x-fragment": {
	compressible: true
},
	"x-shader/x-vertex": {
	compressible: true
}
};

/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

var mimeDb;
var hasRequiredMimeDb;

function requireMimeDb () {
	if (hasRequiredMimeDb) return mimeDb;
	hasRequiredMimeDb = 1;
	/**
	 * Module exports.
	 */

	mimeDb = require$$0;
	return mimeDb;
}

function extname(p) { const m = /\.[^./]*$/.exec(String(p)); return m ? m[0] : ""; }
var _stub_path = { extname };

var _stub_path$1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	default: _stub_path,
	extname: extname
});

var require$$1 = /*@__PURE__*/getAugmentedNamespace(_stub_path$1);

var mimeScore;
var hasRequiredMimeScore;

function requireMimeScore () {
	if (hasRequiredMimeScore) return mimeScore;
	hasRequiredMimeScore = 1;
	// 'mime-score' back-ported to CommonJS

	// Score RFC facets (see https://tools.ietf.org/html/rfc6838#section-3)
	var FACET_SCORES = {
	  'prs.': 100,
	  'x-': 200,
	  'x.': 300,
	  'vnd.': 400,
	  default: 900
	};

	// Score mime source (Logic originally from `jshttp/mime-types` module)
	var SOURCE_SCORES = {
	  nginx: 10,
	  apache: 20,
	  iana: 40,
	  default: 30 // definitions added by `jshttp/mime-db` project?
	};

	var TYPE_SCORES = {
	  // prefer application/xml over text/xml
	  // prefer application/rtf over text/rtf
	  application: 1,

	  // prefer font/woff over application/font-woff
	  font: 2,

	  // prefer video/mp4 over audio/mp4 over application/mp4
	  // See https://www.rfc-editor.org/rfc/rfc4337.html#section-2
	  audio: 2,
	  video: 3,

	  default: 0
	};

	/**
	 * Get each component of the score for a mime type.  The sum of these is the
	 * total score.  The higher the score, the more "official" the type.
	 */
	mimeScore = function mimeScore (mimeType, source = 'default') {
	  if (mimeType === 'application/octet-stream') {
	    return 0
	  }

	  const [type, subtype] = mimeType.split('/');

	  const facet = subtype.replace(/(\.|x-).*/, '$1');

	  const facetScore = FACET_SCORES[facet] || FACET_SCORES.default;
	  const sourceScore = SOURCE_SCORES[source] || SOURCE_SCORES.default;
	  const typeScore = TYPE_SCORES[type] || TYPE_SCORES.default;

	  // All else being equal prefer shorter types
	  const lengthScore = 1 - mimeType.length / 100;

	  return facetScore + sourceScore + typeScore + lengthScore
	};
	return mimeScore;
}

/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

var hasRequiredMimeTypes;

function requireMimeTypes () {
	if (hasRequiredMimeTypes) return mimeTypes;
	hasRequiredMimeTypes = 1;
	(function (exports$1) {

		/**
		 * Module dependencies.
		 * @private
		 */

		var db = requireMimeDb();
		var extname = require$$1.extname;
		var mimeScore = requireMimeScore();

		/**
		 * Module variables.
		 * @private
		 */

		var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
		var TEXT_TYPE_REGEXP = /^text\//i;

		/**
		 * Module exports.
		 * @public
		 */

		exports$1.charset = charset;
		exports$1.charsets = { lookup: charset };
		exports$1.contentType = contentType;
		exports$1.extension = extension;
		exports$1.extensions = Object.create(null);
		exports$1.lookup = lookup;
		exports$1.types = Object.create(null);
		exports$1._extensionConflicts = [];

		// Populate the extensions/types maps
		populateMaps(exports$1.extensions, exports$1.types);

		/**
		 * Get the default charset for a MIME type.
		 *
		 * @param {string} type
		 * @return {false|string}
		 */

		function charset (type) {
		  if (!type || typeof type !== 'string') {
		    return false
		  }

		  // TODO: use media-typer
		  var match = EXTRACT_TYPE_REGEXP.exec(type);
		  var mime = match && db[match[1].toLowerCase()];

		  if (mime && mime.charset) {
		    return mime.charset
		  }

		  // default text/* to utf-8
		  if (match && TEXT_TYPE_REGEXP.test(match[1])) {
		    return 'UTF-8'
		  }

		  return false
		}

		/**
		 * Create a full Content-Type header given a MIME type or extension.
		 *
		 * @param {string} str
		 * @return {false|string}
		 */

		function contentType (str) {
		  // TODO: should this even be in this module?
		  if (!str || typeof str !== 'string') {
		    return false
		  }

		  var mime = str.indexOf('/') === -1 ? exports$1.lookup(str) : str;

		  if (!mime) {
		    return false
		  }

		  // TODO: use content-type or other module
		  if (mime.indexOf('charset') === -1) {
		    var charset = exports$1.charset(mime);
		    if (charset) mime += '; charset=' + charset.toLowerCase();
		  }

		  return mime
		}

		/**
		 * Get the default extension for a MIME type.
		 *
		 * @param {string} type
		 * @return {false|string}
		 */

		function extension (type) {
		  if (!type || typeof type !== 'string') {
		    return false
		  }

		  // TODO: use media-typer
		  var match = EXTRACT_TYPE_REGEXP.exec(type);

		  // get extensions
		  var exts = match && exports$1.extensions[match[1].toLowerCase()];

		  if (!exts || !exts.length) {
		    return false
		  }

		  return exts[0]
		}

		/**
		 * Lookup the MIME type for a file path/extension.
		 *
		 * @param {string} path
		 * @return {false|string}
		 */

		function lookup (path) {
		  if (!path || typeof path !== 'string') {
		    return false
		  }

		  // get the extension ("ext" or ".ext" or full path)
		  var extension = extname('x.' + path)
		    .toLowerCase()
		    .slice(1);

		  if (!extension) {
		    return false
		  }

		  return exports$1.types[extension] || false
		}

		/**
		 * Populate the extensions and types maps.
		 * @private
		 */

		function populateMaps (extensions, types) {
		  Object.keys(db).forEach(function forEachMimeType (type) {
		    var mime = db[type];
		    var exts = mime.extensions;

		    if (!exts || !exts.length) {
		      return
		    }

		    // mime -> extensions
		    extensions[type] = exts;

		    // extension -> mime
		    for (var i = 0; i < exts.length; i++) {
		      var extension = exts[i];
		      types[extension] = _preferredType(extension, types[extension], type);

		      // DELETE (eventually): Capture extension->type maps that change as a
		      // result of switching to mime-score.  This is just to help make reviewing
		      // PR #119 easier, and can be removed once that PR is approved.
		      const legacyType = _preferredTypeLegacy(
		        extension,
		        types[extension],
		        type
		      );
		      if (legacyType !== types[extension]) {
		        exports$1._extensionConflicts.push([extension, legacyType, types[extension]]);
		      }
		    }
		  });
		}

		// Resolve type conflict using mime-score
		function _preferredType (ext, type0, type1) {
		  var score0 = type0 ? mimeScore(type0, db[type0].source) : 0;
		  var score1 = type1 ? mimeScore(type1, db[type1].source) : 0;

		  return score0 > score1 ? type0 : type1
		}

		// Resolve type conflict using pre-mime-score logic
		function _preferredTypeLegacy (ext, type0, type1) {
		  var SOURCE_RANK = ['nginx', 'apache', undefined, 'iana'];

		  var score0 = type0 ? SOURCE_RANK.indexOf(db[type0].source) : 0;
		  var score1 = type1 ? SOURCE_RANK.indexOf(db[type1].source) : 0;

		  if (
		    exports$1.types[extension] !== 'application/octet-stream' &&
		    (score0 > score1 ||
		      (score0 === score1 &&
		        exports$1.types[extension]?.slice(0, 12) === 'application/'))
		  ) {
		    return type0
		  }

		  return score0 > score1 ? type0 : type1
		} 
	} (mimeTypes));
	return mimeTypes;
}

var mimeTypesExports = requireMimeTypes();

// src/resource/resourceLogic.ts
function u$1(u, d, f, p) {
	function m(e, t) {
		let n = (e, t) => {
			let n = typeof t == "object" && t ? t : void 0, r = n?.response?.status, i = n?.status, o = typeof r == "number" ? r : typeof i == "number" ? i : void 0, s = t instanceof Error ? t.message : typeof n?.message == "string" ? n.message : typeof t == "string" ? t : "Upload failed";
			return new e$7(s, e, o);
		};
		return Promise.all(e.map((e) => new Promise((r) => {
			let i = new FileReader();
			i.onload = (i) => {
				try {
					let o = i.target?.result;
					if (!(o instanceof ArrayBuffer)) {
						r({
							success: !1,
							file: e,
							error: n(void 0, /* @__PURE__ */ Error("Unable to read file as an ArrayBuffer"))
						});
						return;
					}
					let s = "", c = e.type;
					if (c) {
						let t = mimeTypesExports.extension(e.type);
						t && t !== "false" && !e.name.endsWith(`.${t}`) && e.type !== mimeTypesExports.lookup(e.name) && (s = `_.${t}`);
					} else if (c = mimeTypesExports.lookup(e.name) || "", !c) {
						r({
							success: !1,
							file: e,
							error: n(void 0, /* @__PURE__ */ Error("Filename has no recognized content type"))
						});
						return;
					}
					let d = `${t}${t.endsWith("/") ? "" : "/"}${encodeURIComponent(e.name)}${s}`;
					u.fetcher.webOperation("PUT", d, {
						data: o,
						contentType: c
					}).then((t) => r(t.ok ? {
						success: !0,
						file: e,
						uploadedUri: d
					} : {
						success: !1,
						file: e,
						error: new e$7(`HTTP error on PUT! Status: ${t.status}`, d, t.status)
					}), (t) => r({
						success: !1,
						file: e,
						error: n(d, t)
					}));
				} catch (t) {
					r({
						success: false,
						file: e,
						error: n(void 0, t)
					});
				}
			}, i.onerror = () => {
				r({
					success: false,
					file: e,
					error: n(void 0, /* @__PURE__ */ Error("Unable to read file"))
				});
			}, i.onabort = () => {
				r({
					success: false,
					file: e,
					error: n(void 0, /* @__PURE__ */ Error("File reading was aborted"))
				});
			};
			try {
				i.readAsArrayBuffer(e);
			} catch (t) {
				r({
					success: false,
					file: e,
					error: n(void 0, t)
				});
			}
		}).catch((t) => ({
			success: false,
			file: e,
			error: n(void 0, t)
		}))));
	}
	function h(e) {
		return f.createContainer(e);
	}
	function g(e) {
		return f.isContainer(e);
	}
	function _(e) {
		return f.getContainerMemberCount(e);
	}
	function v(e) {
		return f.getContainerElements(e);
	}
	function y(e) {
		let t = e.uri.endsWith("/") ? e.uri : `${e.uri}/`;
		return u.sym(`${t}index.ttl#this`);
	}
	function b(e) {
		return u.holds(e, n$7.ldp("contains"), y(e).doc());
	}
	function x(e) {
		return u.holds(e, n$7.rdf("type"), n$7.space("Storage"), e.doc());
	}
	function S(e) {
		let t = e.dir();
		if (!t) return false;
		let n = e.uri.slice(t.uri.length);
		return n.startsWith(".") || n.endsWith(".acl") || n.endsWith(".meta") || n.endsWith("~");
	}
	function C(e, t) {
		let n = u.findTypeURIs(e), r = t.toLowerCase(), i = Util.mediaTypeClass(`${r}/*`).uri.split("*")[0];
		return Object.keys(n).some((e) => e.startsWith(i)) || {
			audio: "http://purl.org/dc/dcmitype/Sound",
			image: "http://purl.org/dc/dcmitype/Image",
			video: "http://purl.org/dc/dcmitype/MovingImage"
		}[r] in n ? true : (u.fetcher.getHeader(e, "content-type") || []).some((e) => e.split(";", 1)[0].trim().toLowerCase().startsWith(`${r}/`));
	}
	function w(e) {
		return C(e, "image");
	}
	function T$1(e) {
		return C(e, "audio");
	}
	function E(e) {
		return C(e, "video");
	}
	function D(e) {
		let t = typeof e == "string" ? e : e.value;
		try {
			let e = new URL(t);
			return e.hash === "#me" && /\/profile\/card\.ttl$/.test(e.pathname);
		} catch {
			return false;
		}
	}
	function O(n, r) {
		let a, o = false, s = false, c = false, l = false, d, f;
		if (r.headers) {
			a = r.headers.get("content-type")?.split(";")[0] ?? void 0;
			let e = t$4(r.headers.get("wac-allow"));
			o = e.canEdit, s = e.canManageAccess, c = e.isPublic, l = e.isPublicKnown, d = r.headers.get("etag") ?? void 0, f = u.anyValue(n, n$7.dct("modified")) || u.anyValue(n, n$7.dc("modified")) || void 0;
		}
		r.headers && r.headers.get("content-type") || r.headers && r.headers.get("wac-allow") && r.headers.get("etag") || u.each(null, u.sym("http://www.w3.org/2007/ont/link#requestedURI"), n).map((e) => {
			let r = u.any(e, u.sym("http://www.w3.org/2007/ont/link#response"));
			if (r && r.termType === "NamedNode") {
				let e = u.anyValue(r, n$7.httph("content-type")) || void 0;
				a === void 0 && (a = e);
				let p = u.anyValue(r, n$7.httph("wac-allow")) || u.anyValue(r, n$7.httph("WAC-Allow")), m = t$4(p);
				o ||= m.canEdit, s ||= m.canManageAccess, c ||= m.isPublic, l ||= m.isPublicKnown;
				let h = u.anyValue(r, n$7.httph("etag")) || void 0;
				d === void 0 && (d = h), f = u.anyValue(n, n$7.dct("modified")) || u.anyValue(n, n$7.dc("modified")) || void 0;
			}
		});
		let p = u.any(n, T)?.value || void 0;
		return {
			contentType: a,
			access: {
				canEdit: o,
				canManageAccess: s,
				isPublic: c,
				isPublicKnown: l
			},
			aclUri: p,
			eTag: d,
			modified: f
		};
	}
	async function k(e) {
		let t = await u.fetcher.webOperation("HEAD", e.uri);
		return n$3(t, "HEAD"), O(e, t);
	}
	async function A(e) {
		let n = u.any(e, n$7.ldp("contains")) || e.dir();
		if (!n || n.termType !== "NamedNode") return false;
		try {
			return (await k(n)).access.canEdit;
		} catch {
			return false;
		}
	}
	async function j(e) {
		return A(e);
	}
	async function M(e) {
		return k(e);
	}
	async function N(e) {
		try {
			let t = await u.fetcher.webOperation("GET", e.uri);
			n$3(t, "GET");
			let r = t.responseText;
			if (r === void 0) throw Error("No text in response object");
			let i = O(e, t);
			if (!i.contentType) throw Error("No content-type available");
			return {
				content: r,
				metadata: i
			};
		} catch (e) {
			throw Error(`Error reading file: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	async function P(e) {
		let t;
		try {
			t = await k(e);
		} catch {
			t = {
				contentType: void 0,
				access: {
					canEdit: false,
					canManageAccess: false,
					isPublic: false
				},
				aclUri: void 0,
				eTag: void 0,
				modified: void 0
			};
		}
		let n = await j(e), r = {
			canEdit: t.access?.canEdit ?? false,
			canManageAccess: t.access?.canManageAccess ?? false,
			isPublic: t.access?.isPublic ?? false,
			isPublicKnown: t.access?.isPublicKnown ?? false,
			canDelete: n
		};
		return {
			...t,
			access: r
		};
	}
	async function F(e, t) {
		if (t) try {
			await p.deleteTypeIndexRegistrationForResource(e, t);
		} catch {}
	}
	async function I(e, i = {}) {
		let a = e.dir();
		if (g(e)) {
			let t = await f.getContainerMembers(e);
			await Promise.all(t.map((e) => I(sym(e), i)));
		}
		let s;
		try {
			s = await u.fetcher._fetch(e.value, { method: "DELETE" }), n$3(s, "DELETE", { allowNotFound: !0 });
		} catch (e) {
			if (!r$3(e)) throw e;
		}
		return i.deleteTypeIndexes && await F(e, i.user), a && u.removeMatches(a, n$7.ldp("contains"), e), u.removeDocument(e), u.fetcher.unload(e.doc()), e$d(`Deleted resource: ${e.value}`), s;
	}
	async function L(e, t) {
		await I(e, {
			deleteTypeIndexes: true,
			user: t
		});
	}
	return {
		uploadFiles: m,
		recursiveDelete: I,
		deleteResourceAndTypeIndexIfExists: L,
		fetchMetadata: M,
		fetchMetadataWithDelete: P,
		fetchContentAndMetadata: N,
		createContainer: h,
		isContainer: g,
		getContainerMembers: v,
		getContainerMemberCount: _,
		getContainerIndexThing: y,
		containerHasIndexDocument: b,
		isStorageRoot: x,
		isHiddenFile: S,
		isMediaType: C,
		isImage: w,
		isAudio: T$1,
		isVideo: E,
		isWebId: D
	};
}

// src/logic/CustomError.ts
var e$6 = class e extends Error {
	constructor(e) {
		super(e), Object.setPrototypeOf(this, new.target.prototype), this.name = new.target.name;
	}
}, t$3 = class t extends e$6 {}, n$2 = class n extends e$6 {}, r$2 = class r extends e$6 {}, i$3 = class i extends e$6 {}, a$3 = class a extends e$6 {}, o$5 = class o extends e$6 {}, s$4 = class s extends e$6 {
	constructor(e, t) {
		super(t), this.status = e;
	}
};

// src/typeIndex/typeIndexDocuments.ts
function e$5() {
	return "@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<>\n    a solid:TypeIndex ;\n    a solid:ListedDocument.";
}
function t$2() {
	return "@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<>\n    a solid:TypeIndex ;\n    a solid:UnlistedDocument.";
}

// src/typeIndex/typeIndexAclDocuments.ts
function e$4(e, t) {
	let n = new URL(t).pathname.split("/").pop() || "publicTypeIndex.ttl";
	return [
		"# ACL resource for the Public Type Index",
		"",
		"@prefix acl: <http://www.w3.org/ns/auth/acl#>.",
		"@prefix foaf: <http://xmlns.com/foaf/0.1/>.",
		"",
		"<#owner>",
		"    a acl:Authorization;",
		"",
		"    acl:agent",
		`        <${e}>;`,
		"",
		`    acl:accessTo <./${n}>;`,
		"",
		"    acl:mode",
		"        acl:Read, acl:Write, acl:Control.",
		"",
		"# Public-readable",
		"<#public>",
		"    a acl:Authorization;",
		"",
		"    acl:agentClass foaf:Agent;",
		"",
		`    acl:accessTo <./${n}>;`,
		"",
		"    acl:mode acl:Read."
	].join("\n");
}

// src/profile/profileDocuments.ts
function e$3() {
	return "@prefix dct: <http://purl.org/dc/terms/>.\n@prefix pim: <http://www.w3.org/ns/pim/space#>.\n@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n<>\n    a pim:ConfigurationFile ;\n    dct:title \"Preferences file\".";
}

// src/profile/profileAclDocuments.ts
function e$2(e) {
	return [
		"@prefix acl: <http://www.w3.org/ns/auth/acl#>.",
		"",
		"<#owner>",
		"a acl:Authorization;",
		`acl:agent <${e}>;`,
		"acl:accessTo <./>;",
		"acl:default <./>;",
		"acl:mode acl:Read, acl:Write, acl:Control."
	].join("\n");
}

// src/util/containerLogic.ts
function n$1(n) {
	function r(e) {
		return n.statementsMatching(e, sym("http://www.w3.org/ns/ldp#contains"), void 0).map((e) => e.object);
	}
	function i(t) {
		let r = n.findTypeURIs(t);
		return !!(t.value.charAt(t.value.length - 1) === "/" || r[n$7.ldp("Container").uri] || r[n$7.ldp("BasicContainer").uri]);
	}
	function a(e) {
		return r(e).length;
	}
	async function o(e) {
		if (!i(sym(e))) throw Error(`Not a container URL ${e}`);
		let r = await n.fetcher._fetch(e, {
			method: "PUT",
			headers: {
				"Content-Type": "text/turtle",
				"If-None-Match": "*",
				Link: "<http://www.w3.org/ns/ldp#BasicContainer>; rel=\"type\""
			},
			body: " "
		});
		if (r.status !== 409 && r.status.toString()[0] !== "2") throw Error(`Not OK: got ${r.status} response while creating container at ${e}`);
	}
	async function s(e) {
		return await n.fetcher.load(e), r(e);
	}
	return {
		isContainer: i,
		createContainer: o,
		getContainerElements: r,
		getContainerMembers: s,
		getContainerMemberCount: a
	};
}

// src/profile/profileLogic.ts
function b(b, x, S) {
	let C = n$7, w = n$1(b), T$1 = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map();
	function D(e) {
		return !!e && (e.startsWith("https://") || e.startsWith("http://"));
	}
	function O(e) {
		let t = e.doc(), n = t.dir();
		if (n?.uri && D(n.uri)) return n.uri;
		let r = t.uri;
		if (!r || !D(r)) return null;
		let i = r.split("#")[0], a = i.lastIndexOf("/");
		return a === -1 ? null : i.slice(0, a + 1);
	}
	function k(e, t) {
		let n = O(e);
		if (!n) throw Error(`Cannot derive directory for preferences file ${e.uri}`);
		return sym(n + t);
	}
	function A(e) {
		if (e?.response?.status === 404) return true;
		let t = `${e?.message || e || ""}`;
		return t.includes("404") || t.includes("Not Found");
	}
	async function j(e) {
		let t = sym(e);
		try {
			await b.fetcher.load(t);
			return;
		} catch (e) {
			if (!A(e)) throw e;
		}
		await w.createContainer(e);
	}
	async function M(t, n) {
		let r = O(n);
		if (!r) throw Error(`Cannot derive settings directory from ${n.uri}`);
		await j(r);
		let i = sym(r), a;
		try {
			await b.fetcher.load(i), a = b.any(i, T)?.value;
		} catch (e) {
			if (!A(e)) throw e;
		}
		a ||= `${r}.acl`;
		let o = sym(a);
		try {
			await b.fetcher.load(o);
			return;
		} catch (e) {
			if (!A(e)) throw e;
		}
		await b.fetcher.webOperation("PUT", o.uri, {
			data: e$2(t.uri),
			contentType: "text/turtle"
		});
	}
	async function N(t, n, r = false) {
		if (!await S.loadOrCreateWithContentOnCreate(n, e$5()) && !r) return;
		let i;
		try {
			await b.fetcher.load(n), i = b.any(n, T)?.value;
		} catch (e) {
			if (!A(e)) throw e;
		}
		i ||= `${n.uri}.acl`;
		let a = sym(i);
		try {
			await b.fetcher.webOperation("PUT", a.uri, {
				data: e$4(t.uri, n.uri),
				contentType: "text/turtle",
				headers: { "If-None-Match": "*" }
			});
		} catch (e) {
			if ((e?.response?.status ?? e?.status) !== 412) throw e;
		}
	}
	async function P(e) {
		await S.loadOrCreateWithContentOnCreate(e, t$2());
	}
	async function F(e, t) {
		let n = t.doc(), r = e.doc();
		await b.fetcher.load(n);
		let i = b.any(e, C.solid("publicTypeIndex"), null, r), a = b.any(e, C.solid("publicTypeIndex"), null, n), o = i || a || k(t, "publicTypeIndex.ttl"), s = b.any(e, C.solid("privateTypeIndex"), null, n) || k(t, "privateTypeIndex.ttl"), c = !i;
		c && await S.followOrCreateLinkWithContentOnCreate(e, C.solid("publicTypeIndex"), o, r, e$5());
		let l = [];
		b.holds(n, C.rdf("type"), C.space("ConfigurationFile"), n) || l.push(st(n, C.rdf("type"), C.space("ConfigurationFile"), n)), b.holds(n, C.dct("title"), void 0, n) || l.push(st(n, C.dct("title"), literal("Preferences file"), n)), b.holds(e, C.solid("publicTypeIndex"), o, n) || l.push(st(e, C.solid("publicTypeIndex"), o, n)), b.holds(e, C.solid("privateTypeIndex"), s, n) || l.push(st(e, C.solid("privateTypeIndex"), s, n)), l.length > 0 && (await b.updater.update([], l), await b.fetcher.load(n)), await N(e, o, c), await P(s);
	}
	async function I(e) {
		try {
			return !!await S.loadOrCreateWithContentOnCreate(e, e$3());
		} catch (n) {
			throw n.response?.status === 401 ? new t$3() : n.response?.status === 403 ? i$4(e) ? new n$2() : new r$2() : n;
		}
	}
	async function L(e) {
		try {
			return await R(e);
		} catch {
			return;
		}
	}
	async function R(e) {
		let c = E.get(e.uri);
		if (c) return c;
		let l = T$1.get(e.uri);
		if (l) return l;
		let u = (async () => {
			await z(e);
			let c = a$4(e), l;
			try {
				l = b.any(e, C.space("preferencesFile"), null, e.doc()) || await S.followOrCreateLink(e, C.space("preferencesFile"), c, e.doc()), await M(e, l), await I(l), await F(e, l);
			} catch (c) {
				let l = `User ${e} has no pointer in profile to preferences file.`;
				throw t$a(l), c;
			}
			try {
				await b.fetcher.load(l);
			} catch (n) {
				let r = `Unable to load preference of user ${e}: ${n}`;
				if (n.response?.status === 404) return await M(e, l), await I(l), await F(e, l), await b.fetcher.load(l), l;
				throw t$a(r), n.response.status === 401 ? new t$3() : n.response.status === 403 ? i$4(l) ? new n$2() : new r$2() : Error(r);
			}
			return E.set(e.uri, l), l;
		})();
		T$1.set(e.uri, u);
		try {
			return await u;
		} finally {
			T$1.get(e.uri) === u && T$1.delete(e.uri);
		}
	}
	async function z(e) {
		if (!e) throw Error("loadProfile: no user given.");
		try {
			await b.fetcher.load(e.doc());
		} catch (t) {
			throw Error(`Unable to load profile of user ${e}: ${t}`);
		}
		return e.doc();
	}
	async function B() {
		let e = x.currentUser();
		if (e === null) throw Error("Current user not found! Not logged in?");
		return await b.fetcher.load(e.doc()), e;
	}
	function V(e) {
		let t = U(e);
		if (!t) throw Error("User pod root not found!");
		return t;
	}
	async function H(e) {
		await b.fetcher.load(e);
		let t = b.any(e, C.ldp("inbox"), void 0, e.doc());
		if (!t) throw Error("User main inbox not found!");
		return t;
	}
	function U(e) {
		return b.any(e, C.space("storage"), void 0, e.doc());
	}
	return {
		loadMe: B,
		getPodRoot: V,
		getMainInbox: H,
		findStorage: U,
		loadPreferences: R,
		loadProfile: z,
		silencedLoadPreferences: L
	};
}

// src/typeIndex/typeIndexLogic.ts
function c$3(c, l, u, d) {
	let f = n$7;
	function p(e) {
		return !!e && (e.startsWith("https://") || e.startsWith("http://"));
	}
	function m(e, t) {
		return c.each(void 0, f.solid("instance"), e).filter((e) => c.holds(e, f.solid("forClass"), t));
	}
	async function h(e, n) {
		if (!e) throw Error("loadTypeIndexesFor: No user given");
		let r = await u.loadProfile(e), o = null;
		try {
			let i = c.any(e, f.solid("publicTypeIndex"), void 0, r);
			if (i) o = i;
			else if (n) {
				let n = null;
				try {
					n = C(e);
				} catch {
					let n = `User ${e} has no usable profile document directory for publicTypeIndex.`;
					t$a(n);
				}
				n && (o = await d.followOrCreateLinkWithContentOnCreate(e, f.solid("publicTypeIndex"), n, r, e$5()));
			}
		} catch (n) {
			let r = `User ${e} has no pointer in profile to publicTypeIndex file: ${n}`;
			t$a(r);
		}
		let s = o ? [{
			label: "public",
			index: o,
			agent: e
		}] : [], l;
		try {
			l = await u.silencedLoadPreferences(e);
		} catch {
			l = null;
		}
		let p;
		if (l) {
			let a = null;
			if (n) try {
				a = w(l);
			} catch {
				let n = `User ${e} has no usable preferences document directory for privateTypeIndex.`;
				t$a(n);
			}
			let o = null;
			try {
				let t = c.any(e, f.solid("privateTypeIndex"), void 0, r);
				t ? o = t : n && a && (o = await d.followOrCreateLinkWithContentOnCreate(e, f.solid("privateTypeIndex"), a, l, t$2()));
			} catch (n) {
				let r = `User ${e} has no pointer in preference file to privateTypeIndex file: ${n}`;
				t$a(r);
			}
			p = o ? [{
				label: "private",
				index: o,
				agent: e
			}] : [];
		} else p = [];
		let m = s.concat(p);
		if (m.length === 0) return m;
		let h = m.map((e) => e.index);
		try {
			await c.fetcher.load(h);
		} catch (e) {
			t$a("Problems loading type index: ", e);
		}
		return m;
	}
	async function g(e) {
		return h(e, true);
	}
	async function _(e) {
		return h(e, false);
	}
	async function v(e) {
		let n;
		try {
			n = await u.silencedLoadPreferences(e);
		} catch {
			let n = `User ${e} has no pointer in profile to preferences file.`;
			t$a(n);
		}
		if (n) {
			let r = c.each(e, f.solid("community"), void 0, n).concat(c.each(e, f.solid("community"), void 0, e.doc())), i = [];
			for (let n of r) if (n.termType !== "NamedNode" || !p(n.uri)) t$a(`Skipping malformed community node for ${e}: ${n}`);
			else try {
				i = i.concat(await g(n));
			} catch (e) {
				t$a(`Skipping community type indexes for ${n.uri}: ${e}`);
			}
			return i;
		}
		return [];
	}
	async function y(e) {
		return (await g(e)).concat(await v(e));
	}
	async function b(e, t) {
		let n = await y(t), r = [];
		for (let t of n) {
			let n = await O(t, e);
			r = r.concat(n);
		}
		return r;
	}
	async function x(e) {
		let t = l.currentUser();
		if (!t) throw Error("getAppInstances: Must be logged in to find apps.");
		return (await b(e, t)).map((e) => e.instance);
	}
	function S(t) {
		let n = t.doc(), r = n.dir();
		if (r?.uri && p(r.uri)) return r.uri;
		let i = n.uri;
		if (!i || !p(i)) return e$d(`docDirUri: missing or non-http(s) doc uri for ${t?.uri}`), null;
		let a = i.split("#")[0], o = a.lastIndexOf("/");
		return o === -1 ? (e$d(`docDirUri: no slash in doc uri ${i}`), null) : a.slice(0, o + 1);
	}
	function C(e) {
		let t = S(e);
		if (!t) throw Error(`suggestPublicTypeIndex: Cannot derive directory for ${e.uri}`);
		return sym(t + "publicTypeIndex.ttl");
	}
	function w(e) {
		let t = S(e);
		if (!t) throw Error(`suggestPrivateTypeIndex: Cannot derive directory for ${e.uri}`);
		return sym(t + "privateTypeIndex.ttl");
	}
	async function T(e, t, n) {
		let i = n$4(t), a = [
			st(i, f.rdf("type"), f.solid("TypeRegistration"), t),
			st(i, f.solid("forClass"), n, t),
			st(i, f.solid("instance"), e, t)
		];
		try {
			await c.updater.update([], a);
		} catch (n) {
			let r = `Unable to register ${e} in index ${t}: ${n}`;
			return console.warn(r), null;
		}
		return i;
	}
	async function E(e) {
		let t = c.the(null, f.solid("instance"), e.instance, e.scope.index);
		if (!t) throw Error(`deleteTypeIndexRegistration: No registration found for ${e.instance}`);
		let n = c.statementsMatching(t, null, null, e.scope.index);
		await c.updater.update(n, []);
	}
	async function D(e, t) {
		let n = (await _(t)).flatMap((t) => {
			let n = c.statementsMatching(null, f.solid("instance"), e, t.index).concat(c.statementsMatching(null, f.solid("instanceContainer"), e, t.index)).map((e) => e.subject);
			return [...new Map(n.map((e) => [e.value, e])).values()].flatMap((e) => {
				let n = c.statementsMatching(e, null, null, t.index);
				return n.length ? [{
					scope: t,
					statements: n
				}] : [];
			});
		});
		return await Promise.all(n.map(({ statements: e }) => c.updater.update(e, []))), n.length > 0;
	}
	async function O(e, t) {
		let n = e.index, r = [], i = c.statementsMatching(null, f.solid("instance"), null, n).concat(c.statementsMatching(null, f.solid("instanceContainer"), null, n)).map((e) => e.subject);
		for (let a of i) {
			let i = c.any(a, f.solid("forClass"), null, n);
			if (!t || i.sameTerm(t)) {
				let t = c.each(a, f.solid("instance"), null, n);
				for (let n of t) r.push({
					instance: n,
					type: i,
					scope: e
				});
				let o = c.each(a, f.solid("instanceContainer"), null, n);
				for (let t of o) await c.fetcher.load(t), r.push({
					instance: sym(t.value),
					type: i,
					scope: e
				});
			}
		}
		return r;
	}
	return {
		registerInTypeIndex: T,
		getRegistrations: m,
		loadTypeIndexesFor: g,
		loadCommunityTypeIndexes: v,
		loadAllTypeIndexes: y,
		getScopedAppInstances: b,
		getAppInstances: x,
		suggestPublicTypeIndex: C,
		suggestPrivateTypeIndex: w,
		deleteTypeIndexRegistration: E,
		deleteTypeIndexRegistrationForResource: D,
		getScopedAppsFromIndex: O
	};
}

// src/directory/directoryHelpers.ts
var t$1 = [
	"contacts",
	"groups",
	"friends",
	"catalog"
];
function n(e) {
	return e.toLowerCase().trim().split(/\s+/).filter(Boolean);
}
function r$1(e, t) {
	let r = n(t);
	if (r.length === 0) return true;
	let i = e.flatMap((e) => n(e)), a = e.join(" ").toLowerCase();
	return r.every((e) => i.some((t) => t.includes(e)) || a.includes(e));
}
function i$2(e) {
	return Array.from(e).sort((e, t) => e.label.localeCompare(t.label, void 0, { sensitivity: "base" }));
}
function a$2(e, t) {
	let n = d$1(t), r = e.get(n);
	if (r) {
		let i = o$4(r, t), a = l$1(i.label, [...r.searchableLabels ?? [r.label], ...t.searchableLabels ?? [t.label]]), s = {
			...r,
			label: i.label,
			relationshipLabel: u(r.relationshipLabel, t.relationshipLabel),
			sources: c$2([...r.sources, ...t.sources]),
			searchableLabels: a
		};
		return e.set(n, s), s;
	}
	let i = {
		...t,
		sources: c$2(t.sources),
		searchableLabels: t.searchableLabels ?? [t.label]
	};
	return e.set(n, i), i;
}
function o$4(e, t) {
	return s$3(t) < s$3(e) ? t : e;
}
function s$3(e) {
	let n = e.sources.map((e) => t$1.indexOf(e));
	return n.length ? Math.min(...n) : t$1.length;
}
function c$2(e) {
	return t$1.filter((t) => e.includes(t));
}
function l$1(e, t) {
	return p$1(t).sort((t, n) => t === e ? -1 : n === e ? 1 : t.localeCompare(n, void 0, { sensitivity: "base" }));
}
function u(e, t) {
	return e === "Contact" || t === "Contact" ? "Contact" : e === "Friend" || t === "Friend" ? "Friend" : e === "Group" || t === "Group" ? "Group" : "People";
}
function d$1(e) {
	return `${e.kind}:${e.uri}`;
}
function f(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !t.has(e.value) && (t.add(e.value), true));
}
function p$1(e) {
	return [...new Set(e)];
}
function m(e) {
	return !!e && (e.startsWith("https://") || e.startsWith("http://"));
}
function h(e) {
	let t = e.split("#")[0], n = e.includes("#") ? e.slice(e.indexOf("#") + 1) : "", r = n && n !== "this" && n !== "me" ? n : t.slice(t.lastIndexOf("/") + 1);
	return decodeURIComponent(r || e).replace(/[_-]+/g, " ");
}
function g(t, n) {
	return t.anyValue(n, n$7.vcard("fn")) || t.anyValue(n, n$7.foaf("name")) || t.anyValue(n, n$7.schema("name")) || t.anyValue(n, n$7.rdfs("label")) || null;
}
function _(e, t) {
	return g(e, t) || h(t.value);
}
async function v(e, t) {
	try {
		return await e.fetcher.load(t.doc()), !0;
	} catch {
		return false;
	}
}

// src/directory/contactsDirectory.ts
var a$1 = 8;
function o$3(o, s) {
	let c = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
	async function u(t) {
		let n = c.get(t.value);
		if (n) return n;
		let r = (async () => {
			let n = await s.loadTypeIndexesFor(t), r = [];
			for (let t of n) {
				let n = await s.getScopedAppsFromIndex(t, n$7.vcard("AddressBook"));
				r = r.concat(n);
			}
			return f(r.map((e) => e.instance));
		})().catch((e) => {
			throw c.delete(t.value), e;
		});
		return c.set(t.value, r), r;
	}
	async function d(t) {
		let n = l.get(t.value);
		if (n) return n;
		let i = (async () => {
			if (!await v(o, t)) return null;
			let n = o.each(t, n$7.vcard("url"), null, t.doc());
			for (let e of n) {
				let n = f$1(e, t.doc());
				if (n) return n;
			}
			return null;
		})().catch((e) => {
			throw l.delete(t.value), e;
		});
		return l.set(t.value, i), i;
	}
	function f$1(n, r) {
		if (!o.holds(n, n$7.rdf("type"), n$7.vcard("WebID"), r)) return null;
		let i = o.any(n, n$7.vcard("value"), null, r)?.value || "";
		return m(i) ? i : null;
	}
	async function p(t, i) {
		let s = await u(t);
		for (let t of s) if (await v(o, t)) {
			let s = o.any(t, n$7.vcard("nameEmailIndex"), null, t.doc());
			if (s && await v(o, s)) {
				let r = o.each(void 0, n$7.vcard("inAddressBook"), t, s);
				for (let t = 0; t < r.length; t += a$1) {
					let c = r.slice(t, t + a$1), l = await Promise.all(c.map(async (t) => {
						let r = await d(t);
						return r ? {
							kind: "person",
							uri: r,
							label: o.anyValue(t, n$7.vcard("fn"), null, s) || _(o, t),
							subjectType: "agent",
							relationshipLabel: "Contact",
							sources: ["contacts"]
						} : null;
					}));
					for (let e of l.filter((e) => !!e)) await i(e);
				}
			}
		}
	}
	async function m$1(t, a) {
		let s = await u(t);
		for (let t of s) if (await v(o, t)) {
			let s = o.any(t, n$7.vcard("groupIndex"), null, t.doc());
			if (s && await v(o, s)) {
				let c = f([...o.each(t, n$7.vcard("includesGroup"), null, s), ...o.each(t, n$7.vcard("includesGroup"), null, t.doc())]);
				for (let e of c) await v(o, e), await a({
					kind: "group",
					uri: e.value,
					label: _(o, e),
					subjectType: "agentGroup",
					relationshipLabel: "Group",
					sources: ["groups"]
				});
			}
		}
	}
	return {
		discoverAddressBookContacts: p,
		discoverAddressBookGroups: m$1
	};
}

// src/directory/friendsDirectory.ts
var r = 6;
function i$1(i) {
	function a(e) {
		return e === 1 ? "Friend" : "People";
	}
	async function o(e, t, r) {
		let o = g(i, e);
		o && await r({
			kind: "person",
			uri: e.value,
			label: o,
			subjectType: "agent",
			relationshipLabel: a(t),
			sources: ["friends"]
		});
	}
	async function s(a, s, c) {
		let l = /* @__PURE__ */ new Set([a.value]), u = /* @__PURE__ */ new Set(), d = /* @__PURE__ */ new Set(), f = [{
			person: a,
			depth: 0
		}], p = async (r) => {
			let { person: f, depth: p } = r, m = f.doc().value;
			if (d.has(m) || (d.add(m), await v(i, f)), f.value !== a.value && (u.has(f.value) || (u.add(f.value), await o(f, p, c))), p >= s) return [];
			let h = [], g$1 = i.each(f, n$7.foaf("knows"));
			for (let e of g$1) if (e.termType === "NamedNode") {
				let t = g(i, e);
				e.value !== a.value && t && !u.has(e.value) && (u.add(e.value), await c({
					kind: "person",
					uri: e.value,
					label: t,
					subjectType: "agent",
					relationshipLabel: p === 0 ? "Friend" : "People",
					sources: ["friends"]
				})), l.has(e.value) || (l.add(e.value), h.push({
					person: e,
					depth: p + 1
				}));
			}
			return h;
		};
		for (; f.length > 0;) {
			let e = [];
			for (let t = 0; t < f.length; t += r) {
				let n = f.slice(t, t + r);
				(await Promise.all(n.map(p))).forEach((t) => e.push(...t));
			}
			f = e;
		}
	}
	return { discoverFoafPeople: s };
}

// src/directory/catalogDirectory.ts
var o$2 = "http://example.org#";
function s$2() {
	let s = /* @__PURE__ */ new Map();
	async function c(e, t) {
		let n = await l(e);
		for (let e of n) await t(e);
	}
	async function l(e) {
		let n = s.get(e);
		if (n) return n;
		let r = u(e).catch((t) => {
			throw s.delete(e), t;
		});
		s.set(e, r);
		try {
			return await r;
		} catch (e) {
			return t$a("[Directory] Error fetching directory catalog:", e), [];
		}
	}
	async function u(t) {
		if (typeof fetch != "function") throw Error("Fetch API is unavailable");
		let s = await fetch(t, { headers: { accept: "text/turtle" } });
		if (!s.ok) throw Error(`Failed to fetch ${t}: ${s.status}`);
		let c = await s.text(), l = graph();
		parse(c, l, t, "text/turtle");
		let u = new NamedNode$1(`${o$2}Person`), d = new NamedNode$1(`${o$2}webid`), f = new NamedNode$1(`${o$2}name`), p = /* @__PURE__ */ new Map(), m$1 = l.statementsMatching(void 0, n$7.rdf("type"), u);
		for (let e of m$1) {
			let t = e.subject, r = l.any(t, d);
			if (r && r.termType === "NamedNode") {
				let e = r.value, i = l.anyValue(t, f);
				m(e) && i && p.set(e, {
					kind: "person",
					uri: e,
					label: i,
					subjectType: "agent",
					relationshipLabel: "People",
					sources: ["catalog"]
				});
			}
		}
		return Array.from(p.values());
	}
	return { discoverCatalogEntries: c };
}

// src/directory/directoryLogic.ts
var o$1 = 3, s$1 = "https://raw.githubusercontent.com/solid/catalog/refs/heads/main/catalog-data.ttl", c$1 = [
	"contacts",
	"friends",
	"catalog",
	"groups"
];
function l(s, l, u) {
	let d = o$3(s, u), f = i$1(s), p = s$2();
	async function m(e) {
		let t = /* @__PURE__ */ new Map(), n = [], r = (e) => {
			a$2(t, e);
		};
		if (e.sources.includes("catalog") && n.push(p.discoverCatalogEntries(e.catalogUrl, r)), e.user && (e.sources.includes("contacts") && n.push(d.discoverAddressBookContacts(e.user, r)), e.sources.includes("groups") && n.push(d.discoverAddressBookGroups(e.user, r)), e.sources.includes("friends") && n.push(f.discoverFoafPeople(e.user, e.maxFoafDistance, r))), !n.length) return [];
		if ((await Promise.allSettled(n)).every((e) => e.status === "rejected")) throw Error("Unable to load directory entries.");
		return i$2(t.values());
	}
	async function h(e = {}) {
		let t = g(e);
		return (await m(t)).filter((e) => r$1([e.label, ...e.searchableLabels ?? []], t.query));
	}
	return { search: h };
	function g(e = {}) {
		let t = e.sources === void 0 ? [...c$1] : [...e.sources];
		return {
			query: e.query ?? "",
			sources: t,
			catalogUrl: e.catalogUrl ?? "https://raw.githubusercontent.com/solid/catalog/refs/heads/main/catalog-data.ttl",
			user: e.user ?? l.currentUser(),
			maxFoafDistance: e.maxFoafDistance ?? o$1
		};
	}
}

// src/util/utilityLogic.ts
function d(d, f, p) {
	async function m(e) {
		try {
			return await d.fetcher.load(e);
		} catch (r) {
			if (r?.response?.status === 404) {
				try {
					await d.fetcher.webOperation("PUT", e.uri, {
						data: "",
						contentType: "text/turtle",
						headers: { "If-None-Match": "*" }
					});
				} catch (t) {
					if ((t?.response?.status ?? t?.status) !== 412) {
						let n = `createIfNotExists: PUT FAILED: ${e}: ${t}`;
						throw new o$5(n);
					}
				}
				return await d.fetcher.load(e);
			}
			if (r?.response?.status === 401) throw new t$3();
			if (r?.response?.status === 403) throw i$4(e) ? new n$2() : new r$2();
			let s = `createIfNotExists doc load error: ${e}: ${r}`;
			throw new s$4(r?.status, `${r?.message || ""}${s}`);
		}
	}
	async function h(e, t) {
		try {
			return await d.fetcher.load(e), !1;
		} catch (e) {
			if ((e?.response?.status ?? e?.status) !== 404) throw e;
		}
		try {
			return await d.fetcher.webOperation("PUT", e.uri, {
				data: t,
				contentType: "text/turtle",
				headers: { "If-None-Match": "*" }
			}), !0;
		} catch (e) {
			if ((e?.response?.status ?? e?.status) === 412) return false;
			throw e;
		}
	}
	async function g(t, n, i, a) {
		if (!await u$2(d, a)) {
			let e = `followOrCreateLink: cannot establish the authorization of ${a.value}`;
			throw t$a(e), new a$3(e);
		}
		let c = d.any(t, n, null, a);
		if (c) return c;
		if (!d.updater.editable(a)) {
			let e = `followOrCreateLink: cannot edit ${a.value}`;
			throw t$a(e), new a$3(e);
		}
		try {
			await d.updater.update([], [st(t, n, i, a)]);
		} catch (e) {
			let t = `followOrCreateLink: Error making link in ${a} to ${i}: ${e}`;
			throw t$a(t), new o$5(e);
		}
		try {
			await m(i);
		} catch (e) {
			throw t$a(`followOrCreateLink: Error loading or saving new linked document: ${i}: ${e}`), e;
		}
		return i;
	}
	async function _(t, n, i, a, c) {
		if (!await u$2(d, a)) {
			let e = `followOrCreateLinkWithContentOnCreate: cannot establish the authorization of ${a.value}`;
			throw t$a(e), new a$3(e);
		}
		let u = d.any(t, n, null, a);
		if (u) return u;
		if (!d.updater.editable(a)) {
			let e = `followOrCreateLinkWithContentOnCreate: cannot edit ${a.value}`;
			throw t$a(e), new a$3(e);
		}
		try {
			await d.updater.update([], [st(t, n, i, a)]);
		} catch (e) {
			let t = `followOrCreateLinkWithContentOnCreate: Error making link in ${a} to ${i}: ${e}`;
			throw t$a(t), new o$5(t);
		}
		try {
			await h(i, c);
		} catch (e) {
			throw t$a(`followOrCreateLinkWithContentOnCreate: Error loading or saving new linked document: ${i}: ${e}`), e;
		}
		return i;
	}
	async function v(e) {
		let t = [
			"@prefix acl: <http://www.w3.org/ns/auth/acl#>.",
			"",
			"<#alice> a acl:Authorization;\n  acl:agent <" + e.ownerWebId + ">;",
			`  acl:accessTo <${e.target}>;`,
			`  acl:default <${e.target}>;`,
			"  acl:mode acl:Read, acl:Write, acl:Control.",
			""
		].join("\n");
		e.accessToModes && (t += [
			"<#bobAccessTo> a acl:Authorization;",
			`  acl:agent <${e.peerWebId}>;`,
			`  acl:accessTo <${e.target}>;`,
			`  acl:mode ${e.accessToModes}.`,
			""
		].join("\n")), e.defaultModes && (t += [
			"<#bobDefault> a acl:Authorization;",
			`  acl:agent <${e.peerWebId}>;`,
			`  acl:default <${e.target}>;`,
			`  acl:mode ${e.defaultModes}.`,
			""
		].join("\n"));
		let n = await f.findAclDocUrl(sym(e.target));
		return d.fetcher._fetch(n, {
			method: "PUT",
			body: t,
			headers: [["Content-Type", "text/turtle"]]
		});
	}
	async function y(e, t) {
		await d.fetcher.webOperation("PUT", e.uri, {
			data: `# ${/* @__PURE__ */ new Date()} ${t}\n`,
			contentType: "text/turtle"
		});
	}
	return {
		setSinglePeerAccess: v,
		createEmptyRdfDoc: y,
		followOrCreateLink: g,
		followOrCreateLinkWithContentOnCreate: _,
		loadOrCreateIfNotExists: m,
		loadOrCreateWithContentOnCreate: h
	};
}

// src/logic/solidLogic.ts
function p(p, m) {
	e$d("SolidLogic: Unique instance created.  There should only be one of these.");
	let h = f$3.graph();
	f$3.fetcher(h, { fetch: p.fetch }), h.updater = new f$3.UpdateManager(h), h.features = [];
	let g = r$5(h, m), _ = new f$1(m), v = _.dispose?.bind(_);
	_.dispose = () => {
		g(), v?.();
	};
	let y = E(h), b$1 = n$1(h), x = d(h, y), S = b(h, _, x), C = s$5(h, S), w = t$6(h, S, x, b$1), T = c$3(h, _, S, x), E$1 = l(h, _, T), D = u$1(h, y, b$1, T);
	e$d("SolidAuthnLogic initialized");
	function O(e) {
		return h.fetcher.load(e);
	}
	function k(e, t = []) {
		return new Promise((n, r) => {
			h.updater.update(e, t, function(e, t, i) {
				t ? n() : r(Error(i));
			});
		});
	}
	function A() {
		h.statements.slice().forEach(h.remove.bind(h));
	}
	return {
		store: h,
		authn: _,
		acl: y,
		resource: D,
		inbox: w,
		chat: C,
		profile: S,
		typeIndex: T,
		directory: E$1,
		load: O,
		updatePromise: k,
		clearStore: A
	};
}

// src/logic/solidLogicSingleton.ts
var i = async (e, r) => {
	let i = r && r.credentials && r.credentials == "omit", a = l$3;
	if (!c$7(a) && (a?.info?.webId || a?.webId) && !i) {
		let t = typeof a.authFetch == "function" ? a.authFetch.bind(a) : typeof a.fetch == "function" ? a.fetch.bind(a) : null;
		return t ? t(e, r) : window.fetch(e, r);
	}
	return window.fetch(e, r);
}, a = Symbol.for("solid-logic-singleton"), o = typeof window < "u" ? window : global;
function s() {
	return o[a] ? e$d("SolidLogic: Using existing global singleton instance.") : (e$d("SolidLogic: Creating new global singleton instance."), o[a] = p({ fetch: i }, l$3), e$d("Unique quadstore initialized.")), o[a];
}
var c = s();

// src/authn/serverLogout.ts
async function e$1(e = {}) {
	if (typeof window > "u") return false;
	let t = e.issuer || "", n = e.postLogoutRedirectPath || "/";
	try {
		if (t) {
			let e = new URL(t);
			e.pathname = "/.well-known/openid-configuration";
			let n = await fetch(e.toString(), { credentials: "include" });
			if (n.status === 200) {
				let e = await n.json();
				e && e.end_session_endpoint && await fetch(e.end_session_endpoint, { credentials: "include" });
			}
		}
	} catch {}
	try {
		let e = await fetch("/.well-known/solid/logout", { credentials: "include" });
		if (e.ok || e.redirected) return window.location.assign(n), !0;
	} catch {}
	return false;
}

// src/issuer/issuerLogic.ts
var e = [
	{
		name: "Solid Community",
		uri: "https://solidcommunity.net"
	},
	{
		name: "Solid Web",
		uri: "https://solidweb.org"
	},
	{
		name: "Solid Web ME",
		uri: "https://solidweb.me"
	},
	{
		name: "Inrupt.com",
		uri: "https://login.inrupt.com"
	}
];
function t() {
	let t = [...e], { host: n, origin: r } = new URL(location.href);
	return t.map(({ uri: e }) => new URL(e).host).includes(n) || t.unshift({
		name: n,
		uri: r
	}), t;
}

// src/index.ts
var O = c.authn, k = c.authn.authSession, A = c.store;

export { v$1 as ACCESS_ROLES, T as ACL_LINK, Authenticated, n$2 as CrossOriginForbiddenError, s$1 as DEFAULT_DIRECTORY_CATALOG_URL, c$1 as DEFAULT_DIRECTORY_SOURCES, s$4 as FetchError, a$3 as NotEditableError, i$3 as NotFoundError, y as PUBLIC_ACCESS_ROLES, Public, e$7 as ResourceUploadError, r$2 as SameOriginForbiddenError, t$3 as UnauthorizedError, b$1 as WRITE_LOCKED_OWNER_ROLE, o$5 as WebOperationError, w as analyzeContainerAccessScope, n$6 as appContext, k as authSession, O as authn, x as classifyAuthorizationScope, C as classifyContainerAccessScope, l as createDirectoryLogic, c$3 as createTypeIndexLogic, S as filterAuthorizationsByContainerScope, t as getSuggestedIssuers, r$6 as offlineTestID, e$1 as performServerSideLogout, C$1 as reloadOnIdentityReplaced, c as solidLogicSingleton, A as store };
