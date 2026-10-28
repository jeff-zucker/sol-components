/*! vendored solid-logic@6.0.0 */
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {}, browser: true, version: "", versions: { node: "" },
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    cwd: () => "/", platform: "browser",
  };
}
import * as d$3 from 'rdflib';
import { graph, Namespace, serialize, sym, NamedNode, st, namedNode, term, literal } from 'rdflib';
import { Session } from '@uvdsl/solid-oidc-client-browser';
import * as t$a from '@uvdsl/solid-oidc-client-browser/core';

//#region src/authSession/identityState.ts
function e$c(e, t) {
	return e.isActive === t.isActive ? t.webId === e.webId ? null : "sessionChange" : t.isActive ? "sessionChange" : "logout";
}
function t$9(e, t) {
	return e.webId === void 0 || !e.isActive ? false : t.webId !== e.webId || !t.isActive;
}
var n$8 = (e) => e.isActive === true || e.isActive === void 0 && !!e.webId, r$6 = 2e3, i$5 = /* @__PURE__ */ new WeakMap(), a$6 = /* @__PURE__ */ new WeakMap(), o$9 = (e) => {
	if (typeof e != "object" || !e) return;
	let t = i$5.get(e);
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
	}, t.raw = u$2(t), i$5.set(e, t)), t;
};
function s$6(e) {
	return typeof e != "object" || !e ? false : i$5.get(e)?.cleared === true;
}
function c$4(e) {
	return s$6(e) ? true : e?.isActive === false || e?.info?.isLoggedIn === false;
}
function l$2(e) {
	return !c$4(e) && n$8(e);
}
var u$2 = (e) => e.cleared ? { isActive: false } : {
	isActive: n$8(e.session),
	webId: e.session.webId
};
function d$2(e) {
	let t = o$9(e);
	return t ? l$2(e) ? e.webId === void 0 ? { source: "none" } : {
		webId: e.webId,
		source: "session"
	} : t.cookieWebId === null ? { source: "none" } : {
		webId: t.cookieWebId,
		source: "cookie"
	} : { source: "none" };
}
function f$2(e) {
	return s$6(e) ? {
		webId: void 0,
		isLoggedIn: false
	} : {
		webId: e.webId,
		isLoggedIn: n$8(e)
	};
}
function p(e) {
	let t = e?.restore;
	if (typeof t != "function" || typeof e != "object" || !e) return;
	let n = e, r = a$6.get(n);
	if (r) return r;
	let i = Promise.resolve().then(() => t.call(e)).finally(() => {
		a$6.delete(n);
	});
	return a$6.set(n, i), i;
}
var m = (e, t) => {
	e.subscribers.forEach((e) => e.onTransition?.(t)), e.subscribers.forEach((e) => {
		t.forEach((t) => e.onEvent?.(t));
	});
};
function h$1(r) {
	r.cleared && n$8(r.session) && (r.cleared = false), l$2(r.session) && (r.cookieWebId = null);
	let i = u$2(r), a = e$c(r.raw, i), o = t$9(r.raw, i), s = a !== null || o;
	if (r.raw = i, !s) return;
	r.version += 1;
	let c = [];
	a && c.push(a), o && c.push("identityReplaced"), m(r, c);
}
function g$1(e) {
	if (e.cleared) return;
	let t = e.raw.isActive, n = e.raw.webId !== void 0;
	if (!t || !n) {
		e.raw = u$2(e), t && (e.version += 1, m(e, ["logout"]));
		return;
	}
	e.cleared = true, e.raw = u$2(e), e.version += 1, m(e, ["logout", "identityReplaced"]);
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
async function v(e) {
	let t = y(e);
	if (typeof t != "function") {
		h$1(e);
		return;
	}
	let i = t, a = _$1(e, () => i()), o = () => a.id !== e.attemptId || e.version !== a.version, s = () => n$8(e.session) === a.raw.isActive && e.session.webId === a.raw.webId, c, l = false, u = a.promise.then((e) => {
		c = e, l = true;
	}, () => {
		l = true;
	}), d = () => {
		if (!o()) {
			if (c === "cleared") {
				s() && g$1(e);
				return;
			}
			h$1(e);
		}
	}, f, p = new Promise((e) => {
		f = setTimeout(e, r$6);
	});
	try {
		await Promise.race([u, p]);
	} finally {
		f !== void 0 && clearTimeout(f);
	}
	if (l) {
		d();
		return;
	}
	h$1(e), u.then(d);
}
function y(e) {
	let t;
	for (let n of e.subscribers) n.resync && (t = n.resync);
	return t;
}
function b$1(e) {
	let t = e.session, n = t.setTokenDetails;
	typeof n != "function" || e.watchingTokenUpdates || (e.watchingTokenUpdates = true, t.setTokenDetails = (...r) => {
		let i = u$2(e), a = () => {
			let t = u$2(e);
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
function x(e, t = {}) {
	let n = o$9(e);
	if (!n) return {
		reportCookieIdentity: () => void 0,
		unsubscribe: () => void 0
	};
	let r = { ...t };
	n.subscribers.add(r), n.listenerAttached || (n.listenerAttached = true, typeof e.addEventListener == "function" && e.addEventListener("sessionStateChange", () => h$1(n)), b$1(n));
	let i = typeof document > "u" ? void 0 : document;
	if (n.subscribers.size === 1 && i && typeof i.addEventListener == "function") {
		let e = () => {
			i.visibilityState === "visible" && (v(n), n.subscribers.forEach((e) => {
				e.onRefocus?.();
			}));
		};
		i.addEventListener("visibilitychange", e), n.detachDocument = () => i.removeEventListener?.("visibilitychange", e);
	}
	let a = false;
	return {
		reportCookieIdentity: (e) => {
			a || S(n, e);
		},
		unsubscribe: () => {
			a || (a = true, n.subscribers.delete(r), n.subscribers.size === 0 && (n.detachDocument?.(), n.detachDocument = void 0));
		}
	};
}
function S(e, t) {
	if (e.cookieWebId === t || l$2(e.session)) return;
	let n = e.cookieWebId !== null;
	e.cookieWebId = t;
	let r = ["sessionChange"];
	n && r.push("identityReplaced"), m(e, r);
}
function C(e, t = () => {
	typeof window < "u" && window.location.reload();
}) {
	!e || typeof e.on != "function" || e.on("identityReplaced", t);
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
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
var t$8 = /*@__PURE__*/getDefaultExportFromCjs(solidNamespaceExports);

//#region src/util/ns.ts
var n$7 = t$8(d$3);

//#region src/acl/aclLogic.ts
var a$5 = sym("http://www.iana.org/assignments/link-relations/acl");
function o$8(i) {
	let o = n$7;
	async function s(e) {
		await i.fetcher.load(e);
		let t = i.any(e, a$5);
		if (!t) throw Error(`No ACL link discovered for ${e}`);
		return t.value;
	}
	function c(e, t, n) {
		let r = i.any(i.sym(e), a$5);
		return Promise.resolve().then(() => r || l(e).catch((t) => {
			throw Error(`Error fetching rel=ACL header for ${e}: ${t}`);
		})).then((r) => {
			let a = u(e, t, r.uri, n);
			if (!i.fetcher) throw Error("Cannot PUT this, store has no fetcher");
			return i.fetcher.webOperation("PUT", r.uri, {
				data: a,
				contentType: "text/turtle"
			}).then((e) => {
				if (!e.ok) throw Error("Error writing ACL text: " + e.error);
				return r;
			});
		});
	}
	function l(e) {
		let t = i.fetcher;
		if (!t) throw Error("Cannot fetch ACL rel, store has no fetcher");
		return t.load(e).then((t) => {
			if (!t.ok) throw Error("fetchACLRel: While loading:" + t.error);
			let n = i.any(i.sym(e), a$5);
			if (!n) throw Error("fetchACLRel: No Link rel=ACL header for " + e);
			return n;
		});
	}
	function u(e, i, a, s = {}) {
		let c = s.public || [], l = graph(), u = Namespace("http://www.w3.org/ns/auth/acl#"), d = l.sym(`${a}#a1`), f = l.sym(a), p = l.sym(e);
		if (l.add(d, o.rdf("type"), u("Authorization"), f), l.add(d, u("accessTo"), p, f), s.defaultForNew && l.add(d, u("default"), p, f), l.add(d, u("agent"), i, f), l.add(d, u("mode"), u("Read"), f), l.add(d, u("mode"), u("Write"), f), l.add(d, u("mode"), u("Control"), f), c.length) {
			d = l.sym(`${a}#a2`), l.add(d, o.rdf("type"), u("Authorization"), f), l.add(d, u("accessTo"), p, f), l.add(d, u("agentClass"), o.foaf("Agent"), f);
			for (let e = 0; e < c.length; e++) l.add(d, u("mode"), u(c[e]), f);
		}
		return serialize(f, l, a);
	}
	return {
		findAclDocUrl: s,
		setACLUserPublic: c,
		genACLText: u
	};
}

//#region src/util/debug.ts
function e$b(...e) {
	console.log(...e);
}
function t$7(...e) {
	console.warn(...e);
}

//#region src/authn/authUtil.ts
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
function r$5() {
	let { $SolidTestEnvironment: n } = window;
	if (n !== void 0 && n.username) return e$b("Assuming the user is " + n.username), sym(n.username);
	if (typeof document < "u" && document.location && ("" + document.location).slice(0, 16) === "http://localhost") {
		let n = document.getElementById("appTarget");
		if (!n) return null;
		let r = n.getAttribute("testID");
		return r ? (e$b("Assuming user is " + r), sym(r)) : null;
	}
	return null;
}

//#region src/logic/CustomError.ts
var e$a = class e extends Error {
	constructor(e) {
		super(e), Object.setPrototypeOf(this, new.target.prototype), this.name = new.target.name;
	}
}, t$6 = class t extends e$a {}, n$5 = class n extends e$a {}, r$4 = class r extends e$a {}, i$4 = class i extends e$a {}, a$4 = class a extends e$a {}, o$7 = class o extends e$a {}, s$5 = class s extends e$a {
	constructor(e, t) {
		super(t), this.status = e;
	}
};

//#region src/util/utils.ts
function n$4(e) {
	return sym(e.uri + "#id" + ("" + Date.now()));
}
function r$3(e, t) {
	let n = t.getUTCFullYear(), r = ("0" + (t.getUTCMonth() + 1)).slice(-2), i = ("0" + t.getUTCDate()).slice(-2), a = e.split("/"), o = a[a.length - 1];
	return new URL(`./archive/${n}/${r}/${i}/${o}`, e).toString();
}
function i$3(e) {
	return e ? `${window.location.origin}/` !== new URL(e.value).origin : true;
}
function a$3(e) {
	return sym(e.uri.replace("/profile/", "/").replace("/public/", "/").split("/").slice(0, -1).join("/") + "/settings/prefs.ttl");
}
function o$6(t, n) {
	return new NamedNode(new URL(`IndividualChats/${new URL(t.value).host}/`, n.value).toString());
}

//#region src/typeIndex/typeIndexDocuments.ts
function e$9() {
	return [
		"@prefix solid: <http://www.w3.org/ns/solid/terms#>.",
		"<>",
		"    a solid:TypeIndex ;",
		"    a solid:ListedDocument."
	].join("\n");
}
function t$5() {
	return [
		"@prefix solid: <http://www.w3.org/ns/solid/terms#>.",
		"<>",
		"    a solid:TypeIndex ;",
		"    a solid:UnlistedDocument."
	].join("\n");
}

//#region src/typeIndex/typeIndexLogic.ts
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
					t$7(`User ${e} has no usable profile document directory for publicTypeIndex.`);
				}
				n && (o = await d.followOrCreateLinkWithContentOnCreate(e, f.solid("publicTypeIndex"), n, r, e$9()));
			}
		} catch (n) {
			t$7(`User ${e} has no pointer in profile to publicTypeIndex file: ${n}`);
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
				t$7(`User ${e} has no usable preferences document directory for privateTypeIndex.`);
			}
			let o = null;
			try {
				let t = c.any(e, f.solid("privateTypeIndex"), void 0, r);
				t ? o = t : n && a && (o = await d.followOrCreateLinkWithContentOnCreate(e, f.solid("privateTypeIndex"), a, l, t$5()));
			} catch (n) {
				t$7(`User ${e} has no pointer in preference file to privateTypeIndex file: ${n}`);
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
			t$7("Problems loading type index: ", e);
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
			t$7(`User ${e} has no pointer in profile to preferences file.`);
		}
		if (n) {
			let r = c.each(e, f.solid("community"), void 0, n).concat(c.each(e, f.solid("community"), void 0, e.doc())), i = [];
			for (let n of r) {
				if (n.termType !== "NamedNode" || !p(n.uri)) {
					t$7(`Skipping malformed community node for ${e}: ${n}`);
					continue;
				}
				try {
					i = i.concat(await g(n));
				} catch (e) {
					t$7(`Skipping community type indexes for ${n.uri}: ${e}`);
				}
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
		if (!i || !p(i)) return e$b(`docDirUri: missing or non-http(s) doc uri for ${t?.uri}`), null;
		let a = i.split("#")[0], o = a.lastIndexOf("/");
		return o === -1 ? (e$b(`docDirUri: no slash in doc uri ${i}`), null) : a.slice(0, o + 1);
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

//#region src/authSession/session.ts
var n$3 = class n {
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
}, r$2 = class r {
	constructor() {
		this.db = null, this.dbName = "soidc", this.storeName = "session", this.dbVersion = 1;
	}
	async shouldPreserveExistingRefreshToken(e, t) {
		if (e !== "refresh_token" || !(t == null || t === "")) return false;
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
		await this.init(), !await this.shouldPreserveExistingRefreshToken(e, t) && await this.withStore("readwrite", (n) => n.put(t, e));
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
function i$2() {
	let e = t$a, n = e.SessionCore ?? e.default?.SessionCore ?? e.default;
	return typeof n == "function" ? n : null;
}
var a$2 = i$2();
function o$5() {
	if (typeof window < "u" && (() => {
		let e = window.location.hostname;
		return e === "localhost" || e === "127.0.0.1" || e.endsWith(".localhost");
	})()) return a$2 ? new a$2(void 0, { database: new r$2() }) : new Session();
	try {
		return new Session();
	} catch (t) {
		console.warn("solid-logic: falling back to non-worker auth session:", t);
		try {
			return a$2 ? new a$2(void 0, { database: new r$2() }) : new Session();
		} catch (t) {
			return console.warn("solid-logic: IndexedDB unavailable, using in-memory session database:", t), a$2 ? new a$2(void 0, { database: new n$3() }) : new Session();
		}
	}
}
var s$4 = o$5();

//#region src/authSession/issuer.ts
async function e$8(e) {
	try {
		let t = new URL(e), n = new URL("/.well-known/openid-configuration", t.origin), r = await fetch(n.toString(), { credentials: "include" });
		if (!r.ok) return null;
		let i = await r.json();
		return typeof i?.issuer != "string" || !i.issuer ? null : i.issuer.replace(/\/$/, "");
	} catch {
		return null;
	}
}
async function t$4(t) {
	return await e$8(t) || t;
}

//#region src/authSession/events.ts
var e$7 = class e {
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

//#region src/authSession/authSession.ts
var o$4 = s$4, s$3 = typeof o$4.login == "function" ? o$4.login.bind(s$4) : void 0;
s$3 && (o$4.login = async (e, n) => {
	if (e && typeof e == "object" && !Array.isArray(e)) {
		let n = e.oidcIssuer ?? e.idp ?? e.issuer, r = e.redirectUrl ?? e.redirect_uri ?? e.redirectUri;
		if (typeof n == "string" && typeof r == "string") return s$3(await t$4(n), r);
	}
	return s$3(typeof e == "string" ? await t$4(e) : e, n);
});
var c$2 = new e$7();
x(s$4, {
	onEvent: (e) => c$2.emit(e),
	resync: () => {
		let t = p(s$4);
		if (t) return t.then(() => "changed", (e) => {
			let t = e instanceof Error ? e.message : String(e);
			return /no session to restore/i.test(t) ? "cleared" : "changed";
		});
	}
});
var l$1 = Object.assign(s$4, { events: c$2 });
Object.defineProperty(l$1, "info", {
	enumerable: true,
	configurable: true,
	get() {
		return f$2(s$4);
	},
	set(e) {}
});

//#region src/authn/SolidAuthnLogic.ts
var u$1 = 5e3;
async function d$1(e) {
	if (e === null) return;
	let t, n = new Promise((e) => {
		t = setTimeout(() => e(void 0), u$1);
	});
	try {
		return await Promise.race([e, n]);
	} finally {
		t !== void 0 && clearTimeout(t);
	}
}
var f$1 = class f {
	constructor(e) {
		this.checkUserInFlight = null, this.sessionRestoreHookAttached = false, this.session = e, this.identity = x(e, { onRefocus: () => this.refreshCookieBackedFallback() });
	}
	dispose() {
		this.identity.unsubscribe();
	}
	async refreshCookieBackedFallback() {
		l$2(this.session) || this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId());
	}
	get authSession() {
		return this.session;
	}
	currentUser() {
		let e = n$6();
		if (e.viewingNoAuthPage) return sym(e.webId);
		let { webId: n } = d$2(this.session);
		return n ? sym(n) : r$5();
	}
	async checkUser(t) {
		let n = new URL(window.location.href).hash;
		n && window.localStorage.setItem("preLoginRedirectHash", n);
		let r = this.session;
		!this.sessionRestoreHookAttached && typeof r?.events?.on == "function" && (r.events.on("sessionRestore", (t) => {
			e$b(`Session restored to ${t}`), document.location.toString() !== t && history.replaceState(null, "", t);
		}), this.sessionRestoreHookAttached = true), this.checkUserInFlight ||= this.resolveCurrentUser();
		let i = this.checkUserInFlight, a;
		try {
			a = await i;
		} finally {
			this.checkUserInFlight === i && (this.checkUserInFlight = null);
		}
		return Promise.resolve(t ? t(a) : a);
	}
	async resolveCurrentUser() {
		let r = this.session, i = new URL(window.location.href);
		if (i.hash = "", typeof r?.handleIncomingRedirect == "function") await r.handleIncomingRedirect({
			restorePreviousSession: true,
			url: i.href
		});
		else {
			let t = r?.isActive ?? !!r?.webId, i = p(r);
			if (i) {
				try {
					await d$1(i);
				} catch (t) {
					let n = t instanceof Error ? t.message : String(t);
					if ((r?.isActive ?? !!r?.webId) && !/no session to restore/i.test(n)) throw t;
					e$b(`Session restore failed, continuing logged-out: ${n}`);
				}
				let n = r?.isActive ?? !!r?.webId;
				!t && n && r.events?.emit("sessionRestore", window.location.href);
			}
			if (typeof r?.handleRedirectFromLogin == "function") {
				let e = r?.isActive ?? !!r?.webId;
				await r.handleRedirectFromLogin();
				let t = r?.isActive ?? !!r?.webId;
				!e && t && r.events?.emit("login");
			}
		}
		let a = window.localStorage.getItem("preLoginRedirectHash");
		if (a) {
			let e = new URL(window.location.href);
			e.hash !== a && (history.pushState ? history.pushState(null, document.title, a) : location.hash = a, e.hash = a), window.localStorage.setItem("preLoginRedirectHash", "");
		}
		let o = r$5();
		if (o) return o;
		let c = this.webIdFromSession(r?.info, r);
		return c ||= (this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId()), d$2(r).webId ?? null), c && (o = this.saveUser(c)), o && e$b(`(Logged in as ${o} by authentication)`), o;
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
			let r = namedNode(n);
			return t && (t.me = r), r;
		}
		return null;
	}
	webIdFromSession(e, t) {
		let n = e?.webId || t?.webId;
		if (!n) return null;
		let r = e?.isLoggedIn, a = t?.isLoggedIn, o = t?.isActive;
		return s$6(t) || r === false || a === false || o === false ? null : n;
	}
};

//#region src/authSession/flagAuthorizationOnTransitions.ts
function n$2(t) {
	try {
		let e = t.updater?.flagAuthorizationMetadata;
		if (typeof e != "function") throw Error("flagAuthorizationMetadata is unavailable");
		return e.call(t.updater), !0;
	} catch (t) {
		return t$7(`Could not flag authorization metadata: ${String(t)}`), false;
	}
}
function r$1(e, r) {
	let i = x(r, { onTransition: () => {
		let t = o$3(e);
		t.generation += 1, t.invalidationFailed = !n$2(e);
	} });
	return () => i.unsubscribe();
}
var i$1 = /* @__PURE__ */ new WeakMap(), a$1 = {
	generation: 0,
	invalidationFailed: false
};
function o$3(e) {
	if (typeof e != "object" || !e) return a$1;
	let t = i$1.get(e);
	return t || (t = {
		generation: 0,
		invalidationFailed: false
	}, i$1.set(e, t)), t;
}
var s$2 = 3;
async function c$1(t, r) {
	let i = o$3(t), a = t.fetcher?.load;
	if (typeof a == "function") for (let o = 0; o < s$2; o++) {
		let o = i.generation;
		if (!n$2(t)) return;
		i.invalidationFailed = false;
		try {
			await a.call(t.fetcher, r);
		} catch (t) {
			t$7(`Could not reload ${String(r)}: ${String(t)}`);
			return;
		}
		if (o === i.generation) return t.updater?.editable?.(r);
	}
}
async function l(e, t) {
	return !o$3(e).invalidationFailed && e.updater?.editable?.(t) !== void 0 ? true : await c$1(e, t) !== void 0;
}
async function u(e, t) {
	let n = o$3(e), r = n.generation, i = e.fetcher?.load;
	if (typeof i != "function") throw Error("fetcher.load is unavailable");
	return await i.call(e.fetcher, t), r === n.generation ? l(e, t) : await c$1(e, t) !== void 0;
}

//#region src/chat/chatLogic.ts
var o$2 = "index.ttl#this";
function s$1(s, c) {
	let l = n$7;
	async function u(e, t, n) {
		await s.fetcher.load(e);
		let i = s.any(e, new NamedNode("http://www.iana.org/assignments/link-relations/acl"));
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
		let n = await c.loadMe(), i = o$6(e, await c.getPodRoot(n)), a = true;
		try {
			await s.fetcher.load(new NamedNode(i.value + "index.ttl#this"));
		} catch {
			a = false;
		}
		return {
			me: n,
			chatContainer: i,
			exists: a
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
		let r = e.newInstance = e.newInstance || t.sym(e.newBase + o$2), i = r.doc();
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
		if (a) return new NamedNode(i.value + o$2);
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

//#region src/inbox/inboxLogic.ts
function t$3(t, n, r, i, a) {
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
		let a = r$3(n, r), o = {
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

//#region src/resource/resourceHttp.ts
function e$6(e) {
	return e?.status ?? e?.response?.status;
}
function t$2(e) {
	return e === 404 || e === 410;
}
function n$1(e, n, r = {}) {
	if (e.ok || r.allowNotFound && t$2(e.status)) return;
	let i = e.status === 412 ? "Error: File changed by someone else" : `HTTP error on ${n}! Status: ${e.status}`;
	throw Error(i);
}
function r(n) {
	if (t$2(e$6(n))) return true;
	let r = `${n?.message || n || ""}`;
	return r.includes("404") || r.includes("Not Found");
}

//#region src/resource/resourceMetadata.ts
function e$5(e) {
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
function t$1(t) {
	if (!t) return {
		canEdit: false,
		isPublic: false
	};
	let n = e$5(t), r = n.get("user") ?? /* @__PURE__ */ new Set(), i = n.get("public") ?? /* @__PURE__ */ new Set();
	return {
		canEdit: r.has("write"),
		isPublic: i.has("read") || i.has("write")
	};
}

//#region src/resource/resourceLogic.ts
function o$1(o, s, c, l) {
	function u(e) {
		return c.createContainer(e);
	}
	function d(e) {
		return c.isContainer(e);
	}
	function f(e) {
		return c.getContainerMemberCount(e);
	}
	function p(n, r) {
		let a, s = false, c = false, l, u;
		if (r.headers) {
			a = r.headers.get("content-type")?.split(";")[0] ?? void 0;
			let t = t$1(r.headers.get("wac-allow"));
			s = t.canEdit, c = t.isPublic, l = r.headers.get("etag") ?? void 0, u = o.anyValue(n, n$7.dct("modified")) || o.anyValue(n, n$7.dc("modified")) || void 0;
		}
		(!r.headers || !r.headers.get("content-type")) && (!r.headers || !r.headers.get("wac-allow") || !r.headers.get("etag")) && o.each(null, o.sym("http://www.w3.org/2007/ont/link#requestedURI"), n).map((t) => {
			let r = o.any(t, o.sym("http://www.w3.org/2007/ont/link#response"));
			if (r && r.termType === "NamedNode") {
				let t = o.anyValue(r, n$7.httph("content-type")) || void 0;
				a === void 0 && (a = t);
				let d = t$1(o.anyValue(r, n$7.httph("wac-allow")) || o.anyValue(r, n$7.httph("WAC-Allow")));
				s ||= d.canEdit, c ||= d.isPublic;
				let f = o.anyValue(r, n$7.httph("etag")) || void 0;
				l === void 0 && (l = f), u = o.anyValue(n, n$7.dct("modified")) || o.anyValue(n, n$7.dc("modified")) || void 0;
			}
		});
		let d = o.any(n, a$5)?.value || void 0;
		return {
			contentType: a,
			access: {
				canEdit: s,
				isPublic: c
			},
			aclUri: d,
			eTag: l,
			modified: u
		};
	}
	async function m(e) {
		let t = await o.fetcher.webOperation("HEAD", e.uri);
		return n$1(t, "HEAD"), p(e, t);
	}
	async function h(t) {
		let n = o.any(t, n$7.ldp("contains")) || t.dir();
		if (!n || n.termType !== "NamedNode") return false;
		try {
			return (await m(n)).access.canEdit;
		} catch {
			return false;
		}
	}
	async function g(e) {
		return h(e);
	}
	async function _(e) {
		return m(e);
	}
	async function v(e) {
		let t;
		try {
			t = await m(e);
		} catch {
			t = {
				contentType: void 0,
				access: {
					canEdit: false,
					isPublic: false
				},
				aclUri: void 0,
				eTag: void 0,
				modified: void 0
			};
		}
		let n = await g(e), r = {
			canEdit: t.access?.canEdit ?? false,
			isPublic: t.access?.isPublic ?? false,
			canDelete: n
		};
		return {
			...t,
			access: r
		};
	}
	async function y(e, t) {
		if (t) try {
			await l.deleteTypeIndexRegistrationForResource(e, t);
		} catch {}
	}
	async function b(t, i = {}) {
		let s = t.dir();
		if (d(t)) {
			let e = await c.getContainerMembers(t);
			await Promise.all(e.map((e) => b(sym(e), i)));
		}
		let l;
		try {
			l = await o.fetcher._fetch(t.value, { method: "DELETE" }), n$1(l, "DELETE", { allowNotFound: !0 });
		} catch (e) {
			if (!r(e)) throw e;
		}
		return i.deleteTypeIndexes && await y(t, i.user), s && o.removeMatches(s, n$7.ldp("contains"), t, s.doc()), o.removeDocument(t), o.fetcher.unload(t.doc()), l;
	}
	async function x(e, t) {
		await b(e, {
			deleteTypeIndexes: true,
			user: t
		});
	}
	return {
		recursiveDelete: b,
		deleteResourceAndTypeIndexIfExists: x,
		fetchMetadata: _,
		fetchMetadataWithDelete: v,
		createContainer: u,
		isContainer: d,
		getContainerMemberCount: f
	};
}

//#region src/util/containerLogic.ts
function n(n) {
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

//#region src/typeIndex/typeIndexAclDocuments.ts
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

//#region src/profile/profileDocuments.ts
function e$3() {
	return [
		"@prefix dct: <http://purl.org/dc/terms/>.",
		"@prefix pim: <http://www.w3.org/ns/pim/space#>.",
		"@prefix solid: <http://www.w3.org/ns/solid/terms#>.",
		"<>",
		"    a pim:ConfigurationFile ;",
		"    dct:title \"Preferences file\"."
	].join("\n");
}

//#region src/profile/profileAclDocuments.ts
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

//#region src/profile/profileLogic.ts
function b(b, x, S) {
	let C = n$7, w = n(b), T = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map();
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
	async function M(e, t) {
		let r = O(t);
		if (!r) throw Error(`Cannot derive settings directory from ${t.uri}`);
		await j(r);
		let i = sym(r), a;
		try {
			await b.fetcher.load(i), a = b.any(i, a$5)?.value;
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
			data: e$2(e.uri),
			contentType: "text/turtle"
		});
	}
	async function N(e, t, r = false) {
		if (!await S.loadOrCreateWithContentOnCreate(t, e$9()) && !r) return;
		let i;
		try {
			await b.fetcher.load(t), i = b.any(t, a$5)?.value;
		} catch (e) {
			if (!A(e)) throw e;
		}
		i ||= `${t.uri}.acl`;
		let a = sym(i);
		try {
			await b.fetcher.webOperation("PUT", a.uri, {
				data: e$4(e.uri, t.uri),
				contentType: "text/turtle",
				headers: { "If-None-Match": "*" }
			});
		} catch (e) {
			if ((e?.response?.status ?? e?.status) !== 412) throw e;
		}
	}
	async function P(e) {
		await S.loadOrCreateWithContentOnCreate(e, t$5());
	}
	async function F(e, t) {
		let n = t.doc(), r = e.doc();
		await b.fetcher.load(n);
		let i = b.any(e, C.solid("publicTypeIndex"), null, r), a = b.any(e, C.solid("publicTypeIndex"), null, n), o = i || a || k(t, "publicTypeIndex.ttl"), s = b.any(e, C.solid("privateTypeIndex"), null, n) || k(t, "privateTypeIndex.ttl"), c = !i;
		c && await S.followOrCreateLinkWithContentOnCreate(e, C.solid("publicTypeIndex"), o, r, e$9());
		let l = [];
		b.holds(n, C.rdf("type"), C.space("ConfigurationFile"), n) || l.push(st(n, C.rdf("type"), C.space("ConfigurationFile"), n)), b.holds(n, C.dct("title"), void 0, n) || l.push(st(n, C.dct("title"), literal("Preferences file"), n)), b.holds(e, C.solid("publicTypeIndex"), o, n) || l.push(st(e, C.solid("publicTypeIndex"), o, n)), b.holds(e, C.solid("privateTypeIndex"), s, n) || l.push(st(e, C.solid("privateTypeIndex"), s, n)), l.length > 0 && (await b.updater.update([], l), await b.fetcher.load(n)), await N(e, o, c), await P(s);
	}
	async function I(e) {
		try {
			return !!await S.loadOrCreateWithContentOnCreate(e, e$3());
		} catch (t) {
			throw t.response?.status === 401 ? new t$6() : t.response?.status === 403 ? i$3(e) ? new n$5() : new r$4() : t;
		}
	}
	async function L(e) {
		try {
			return await R(e);
		} catch {
			return;
		}
	}
	async function R(t) {
		let n = E.get(t.uri);
		if (n) return n;
		let d = T.get(t.uri);
		if (d) return d;
		let f = (async () => {
			await z(t);
			let n = a$3(t), d;
			try {
				d = b.any(t, C.space("preferencesFile"), null, t.doc()) || await S.followOrCreateLink(t, C.space("preferencesFile"), n, t.doc()), await M(t, d), await I(d), await F(t, d);
			} catch (n) {
				throw t$7(`User ${t} has no pointer in profile to preferences file.`), n;
			}
			try {
				await b.fetcher.load(d);
			} catch (n) {
				let i = `Unable to load preference of user ${t}: ${n}`;
				if (n.response?.status === 404) return await M(t, d), await I(d), await F(t, d), await b.fetcher.load(d), d;
				throw t$7(i), n.response.status === 401 ? new t$6() : n.response.status === 403 ? i$3(d) ? new n$5() : new r$4() : Error(i);
			}
			return E.set(t.uri, d), d;
		})();
		T.set(t.uri, f);
		try {
			return await f;
		} finally {
			T.get(t.uri) === f && T.delete(t.uri);
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

//#region src/util/utilityLogic.ts
function d(d, f, p) {
	async function m(e) {
		try {
			return await d.fetcher.load(e);
		} catch (t) {
			if (t?.response?.status === 404) {
				try {
					await d.fetcher.webOperation("PUT", e.uri, {
						data: "",
						contentType: "text/turtle",
						headers: { "If-None-Match": "*" }
					});
				} catch (t) {
					if ((t?.response?.status ?? t?.status) !== 412) throw new o$7(`createIfNotExists: PUT FAILED: ${e}: ${t}`);
				}
				return await d.fetcher.load(e);
			}
			if (t?.response?.status === 401) throw new t$6();
			if (t?.response?.status === 403) throw i$3(e) ? new n$5() : new r$4();
			let a = `createIfNotExists doc load error: ${e}: ${t}`;
			throw new s$5(t?.status, `${t?.message || ""}${a}`);
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
	async function g(n, r, i, o) {
		if (!await u(d, o)) {
			let t = `followOrCreateLink: cannot establish the authorization of ${o.value}`;
			throw t$7(t), new a$4(t);
		}
		let s = d.any(n, r, null, o);
		if (s) return s;
		if (!d.updater.editable(o)) {
			let t = `followOrCreateLink: cannot edit ${o.value}`;
			throw t$7(t), new a$4(t);
		}
		try {
			await d.updater.update([], [st(n, r, i, o)]);
		} catch (t) {
			throw t$7(`followOrCreateLink: Error making link in ${o} to ${i}: ${t}`), new o$7(t);
		}
		try {
			await m(i);
		} catch (t) {
			throw t$7(`followOrCreateLink: Error loading or saving new linked document: ${i}: ${t}`), t;
		}
		return i;
	}
	async function _(n, r, i, o, s) {
		if (!await u(d, o)) {
			let t = `followOrCreateLinkWithContentOnCreate: cannot establish the authorization of ${o.value}`;
			throw t$7(t), new a$4(t);
		}
		let u$1 = d.any(n, r, null, o);
		if (u$1) return u$1;
		if (!d.updater.editable(o)) {
			let t = `followOrCreateLinkWithContentOnCreate: cannot edit ${o.value}`;
			throw t$7(t), new a$4(t);
		}
		try {
			await d.updater.update([], [st(n, r, i, o)]);
		} catch (t) {
			let n = `followOrCreateLinkWithContentOnCreate: Error making link in ${o} to ${i}: ${t}`;
			throw t$7(n), new o$7(n);
		}
		try {
			await h(i, s);
		} catch (t) {
			throw t$7(`followOrCreateLinkWithContentOnCreate: Error loading or saving new linked document: ${i}: ${t}`), t;
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

//#region src/logic/solidLogic.ts
function f(f, p) {
	e$b("SolidLogic: Unique instance created.  There should only be one of these.");
	let m = d$3.graph();
	d$3.fetcher(m, { fetch: f.fetch }), m.updater = new d$3.UpdateManager(m), m.features = [];
	let h = r$1(m, p), g = new f$1(p), _ = g.dispose?.bind(g);
	g.dispose = () => {
		h(), _?.();
	};
	let v = o$8(m), y = n(m), b$1 = d(m, v), x = b(m, g, b$1), S = s$1(m, x), C = t$3(m, x, b$1, y), w = c$3(m, g, x, b$1), T = o$1(m, v, y, w);
	e$b("SolidAuthnLogic initialized");
	function E(e) {
		return m.fetcher.load(e);
	}
	function D(e, t = []) {
		return new Promise((n, r) => {
			m.updater.update(e, t, function(e, t, i) {
				t ? n() : r(Error(i));
			});
		});
	}
	function O() {
		m.statements.slice().forEach(m.remove.bind(m));
	}
	return {
		store: m,
		authn: g,
		acl: v,
		resource: T,
		inbox: C,
		chat: S,
		profile: x,
		typeIndex: w,
		load: E,
		updatePromise: D,
		clearStore: O
	};
}

//#region src/logic/solidLogicSingleton.ts
var i = async (e, r) => {
	let i = r && r.credentials && r.credentials == "omit", a = l$1;
	if (!c$4(a) && (a?.info?.webId || a?.webId) && !i) {
		let t = typeof a.fetch == "function" ? a.fetch.bind(a) : typeof a.authFetch == "function" ? a.authFetch.bind(a) : null;
		return t ? t(e, r) : window.fetch(e, r);
	} else return window.fetch(e, r);
}, a = Symbol.for("solid-logic-singleton"), o = typeof window < "u" ? window : global;
function s() {
	return o[a] ? e$b("SolidLogic: Using existing global singleton instance.") : (e$b("SolidLogic: Creating new global singleton instance."), o[a] = f({ fetch: i }, l$1), e$b("Unique quadstore initialized.")), o[a];
}
var c = s();

//#region src/authn/serverLogout.ts
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

//#region src/issuer/issuerLogic.ts
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

//#region src/index.ts
var h = c.authn, g = c.authn.authSession, _ = c.store;

export { a$5 as ACL_LINK, n$5 as CrossOriginForbiddenError, s$5 as FetchError, a$4 as NotEditableError, i$4 as NotFoundError, r$4 as SameOriginForbiddenError, t$6 as UnauthorizedError, o$7 as WebOperationError, n$6 as appContext, g as authSession, h as authn, c$3 as createTypeIndexLogic, t as getSuggestedIssuers, r$5 as offlineTestID, e$1 as performServerSideLogout, C as reloadOnIdentityReplaced, c as solidLogicSingleton, _ as store };
