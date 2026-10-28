/*! vendored @uvdsl/solid-oidc-client-browser@0.2.3 */
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {}, browser: true, version: "", versions: { node: "" },
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    cwd: () => "/", platform: "browser",
  };
}
var crypto$1 = crypto;
const isCryptoKey$1 = (key) => key instanceof CryptoKey;

const digest = async (algorithm, data) => {
    const subtleDigest = `SHA-${algorithm.slice(-3)}`;
    return new Uint8Array(await crypto$1.subtle.digest(subtleDigest, data));
};
var digest$1 = digest;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function concat(...buffers) {
    const size = buffers.reduce((acc, { length }) => acc + length, 0);
    const buf = new Uint8Array(size);
    let i = 0;
    for (const buffer of buffers) {
        buf.set(buffer, i);
        i += buffer.length;
    }
    return buf;
}

const encodeBase64 = (input) => {
    let unencoded = input;
    if (typeof unencoded === 'string') {
        unencoded = encoder.encode(unencoded);
    }
    const CHUNK_SIZE = 0x8000;
    const arr = [];
    for (let i = 0; i < unencoded.length; i += CHUNK_SIZE) {
        arr.push(String.fromCharCode.apply(null, unencoded.subarray(i, i + CHUNK_SIZE)));
    }
    return btoa(arr.join(''));
};
const encode = (input) => {
    return encodeBase64(input).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const decodeBase64 = (encoded) => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};
const decode$1 = (input) => {
    let encoded = input;
    if (encoded instanceof Uint8Array) {
        encoded = decoder.decode(encoded);
    }
    encoded = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    try {
        return decodeBase64(encoded);
    }
    catch {
        throw new TypeError('The input to be decoded is not correctly encoded.');
    }
};

let JOSEError$1 = class JOSEError extends Error {
    constructor(message, options) {
        super(message, options);
        this.code = 'ERR_JOSE_GENERIC';
        this.name = this.constructor.name;
        Error.captureStackTrace?.(this, this.constructor);
    }
};
JOSEError$1.code = 'ERR_JOSE_GENERIC';
let JWTClaimValidationFailed$1 = class JWTClaimValidationFailed extends JOSEError$1 {
    constructor(message, payload, claim = 'unspecified', reason = 'unspecified') {
        super(message, { cause: { claim, reason, payload } });
        this.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
    }
};
JWTClaimValidationFailed$1.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
let JWTExpired$1 = class JWTExpired extends JOSEError$1 {
    constructor(message, payload, claim = 'unspecified', reason = 'unspecified') {
        super(message, { cause: { claim, reason, payload } });
        this.code = 'ERR_JWT_EXPIRED';
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
    }
};
JWTExpired$1.code = 'ERR_JWT_EXPIRED';
let JOSEAlgNotAllowed$1 = class JOSEAlgNotAllowed extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JOSE_ALG_NOT_ALLOWED';
    }
};
JOSEAlgNotAllowed$1.code = 'ERR_JOSE_ALG_NOT_ALLOWED';
let JOSENotSupported$1 = class JOSENotSupported extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JOSE_NOT_SUPPORTED';
    }
};
JOSENotSupported$1.code = 'ERR_JOSE_NOT_SUPPORTED';
let JWEDecryptionFailed$1 = class JWEDecryptionFailed extends JOSEError$1 {
    constructor(message = 'decryption operation failed', options) {
        super(message, options);
        this.code = 'ERR_JWE_DECRYPTION_FAILED';
    }
};
JWEDecryptionFailed$1.code = 'ERR_JWE_DECRYPTION_FAILED';
let JWEInvalid$1 = class JWEInvalid extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWE_INVALID';
    }
};
JWEInvalid$1.code = 'ERR_JWE_INVALID';
let JWSInvalid$1 = class JWSInvalid extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWS_INVALID';
    }
};
JWSInvalid$1.code = 'ERR_JWS_INVALID';
let JWTInvalid$1 = class JWTInvalid extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWT_INVALID';
    }
};
JWTInvalid$1.code = 'ERR_JWT_INVALID';
let JWKInvalid$1 = class JWKInvalid extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWK_INVALID';
    }
};
JWKInvalid$1.code = 'ERR_JWK_INVALID';
let JWKSInvalid$1 = class JWKSInvalid extends JOSEError$1 {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWKS_INVALID';
    }
};
JWKSInvalid$1.code = 'ERR_JWKS_INVALID';
let JWKSNoMatchingKey$1 = class JWKSNoMatchingKey extends JOSEError$1 {
    constructor(message = 'no applicable key found in the JSON Web Key Set', options) {
        super(message, options);
        this.code = 'ERR_JWKS_NO_MATCHING_KEY';
    }
};
JWKSNoMatchingKey$1.code = 'ERR_JWKS_NO_MATCHING_KEY';
let JWKSMultipleMatchingKeys$1 = class JWKSMultipleMatchingKeys extends JOSEError$1 {
    constructor(message = 'multiple matching keys found in the JSON Web Key Set', options) {
        super(message, options);
        this.code = 'ERR_JWKS_MULTIPLE_MATCHING_KEYS';
    }
};
JWKSMultipleMatchingKeys$1.code = 'ERR_JWKS_MULTIPLE_MATCHING_KEYS';
let JWKSTimeout$1 = class JWKSTimeout extends JOSEError$1 {
    constructor(message = 'request timed out', options) {
        super(message, options);
        this.code = 'ERR_JWKS_TIMEOUT';
    }
};
JWKSTimeout$1.code = 'ERR_JWKS_TIMEOUT';
let JWSSignatureVerificationFailed$1 = class JWSSignatureVerificationFailed extends JOSEError$1 {
    constructor(message = 'signature verification failed', options) {
        super(message, options);
        this.code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
    }
};
JWSSignatureVerificationFailed$1.code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';

function unusable(name, prop = 'algorithm.name') {
    return new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
}
function isAlgorithm(algorithm, name) {
    return algorithm.name === name;
}
function getHashLength(hash) {
    return parseInt(hash.name.slice(4), 10);
}
function getNamedCurve(alg) {
    switch (alg) {
        case 'ES256':
            return 'P-256';
        case 'ES384':
            return 'P-384';
        case 'ES512':
            return 'P-521';
        default:
            throw new Error('unreachable');
    }
}
function checkUsage(key, usages) {
    if (usages.length && !usages.some((expected) => key.usages.includes(expected))) {
        let msg = 'CryptoKey does not support this operation, its usages must include ';
        if (usages.length > 2) {
            const last = usages.pop();
            msg += `one of ${usages.join(', ')}, or ${last}.`;
        }
        else if (usages.length === 2) {
            msg += `one of ${usages[0]} or ${usages[1]}.`;
        }
        else {
            msg += `${usages[0]}.`;
        }
        throw new TypeError(msg);
    }
}
function checkSigCryptoKey(key, alg, ...usages) {
    switch (alg) {
        case 'HS256':
        case 'HS384':
        case 'HS512': {
            if (!isAlgorithm(key.algorithm, 'HMAC'))
                throw unusable('HMAC');
            const expected = parseInt(alg.slice(2), 10);
            const actual = getHashLength(key.algorithm.hash);
            if (actual !== expected)
                throw unusable(`SHA-${expected}`, 'algorithm.hash');
            break;
        }
        case 'RS256':
        case 'RS384':
        case 'RS512': {
            if (!isAlgorithm(key.algorithm, 'RSASSA-PKCS1-v1_5'))
                throw unusable('RSASSA-PKCS1-v1_5');
            const expected = parseInt(alg.slice(2), 10);
            const actual = getHashLength(key.algorithm.hash);
            if (actual !== expected)
                throw unusable(`SHA-${expected}`, 'algorithm.hash');
            break;
        }
        case 'PS256':
        case 'PS384':
        case 'PS512': {
            if (!isAlgorithm(key.algorithm, 'RSA-PSS'))
                throw unusable('RSA-PSS');
            const expected = parseInt(alg.slice(2), 10);
            const actual = getHashLength(key.algorithm.hash);
            if (actual !== expected)
                throw unusable(`SHA-${expected}`, 'algorithm.hash');
            break;
        }
        case 'EdDSA': {
            if (key.algorithm.name !== 'Ed25519' && key.algorithm.name !== 'Ed448') {
                throw unusable('Ed25519 or Ed448');
            }
            break;
        }
        case 'Ed25519': {
            if (!isAlgorithm(key.algorithm, 'Ed25519'))
                throw unusable('Ed25519');
            break;
        }
        case 'ES256':
        case 'ES384':
        case 'ES512': {
            if (!isAlgorithm(key.algorithm, 'ECDSA'))
                throw unusable('ECDSA');
            const expected = getNamedCurve(alg);
            const actual = key.algorithm.namedCurve;
            if (actual !== expected)
                throw unusable(expected, 'algorithm.namedCurve');
            break;
        }
        default:
            throw new TypeError('CryptoKey does not support this operation');
    }
    checkUsage(key, usages);
}

function message$1(msg, actual, ...types) {
    types = types.filter(Boolean);
    if (types.length > 2) {
        const last = types.pop();
        msg += `one of type ${types.join(', ')}, or ${last}.`;
    }
    else if (types.length === 2) {
        msg += `one of type ${types[0]} or ${types[1]}.`;
    }
    else {
        msg += `of type ${types[0]}.`;
    }
    if (actual == null) {
        msg += ` Received ${actual}`;
    }
    else if (typeof actual === 'function' && actual.name) {
        msg += ` Received function ${actual.name}`;
    }
    else if (typeof actual === 'object' && actual != null) {
        if (actual.constructor?.name) {
            msg += ` Received an instance of ${actual.constructor.name}`;
        }
    }
    return msg;
}
var invalidKeyInput = (actual, ...types) => {
    return message$1('Key must be ', actual, ...types);
};
function withAlg$1(alg, actual, ...types) {
    return message$1(`Key for the ${alg} algorithm must be `, actual, ...types);
}

var isKeyLike$1 = (key) => {
    if (isCryptoKey$1(key)) {
        return true;
    }
    return key?.[Symbol.toStringTag] === 'KeyObject';
};
const types$1 = ['CryptoKey'];

const isDisjoint = (...headers) => {
    const sources = headers.filter(Boolean);
    if (sources.length === 0 || sources.length === 1) {
        return true;
    }
    let acc;
    for (const header of sources) {
        const parameters = Object.keys(header);
        if (!acc || acc.size === 0) {
            acc = new Set(parameters);
            continue;
        }
        for (const parameter of parameters) {
            if (acc.has(parameter)) {
                return false;
            }
            acc.add(parameter);
        }
    }
    return true;
};
var isDisjoint$1 = isDisjoint;

function isObjectLike$1(value) {
    return typeof value === 'object' && value !== null;
}
function isObject$1(input) {
    if (!isObjectLike$1(input) || Object.prototype.toString.call(input) !== '[object Object]') {
        return false;
    }
    if (Object.getPrototypeOf(input) === null) {
        return true;
    }
    let proto = input;
    while (Object.getPrototypeOf(proto) !== null) {
        proto = Object.getPrototypeOf(proto);
    }
    return Object.getPrototypeOf(input) === proto;
}

var checkKeyLength = (alg, key) => {
    if (alg.startsWith('RS') || alg.startsWith('PS')) {
        const { modulusLength } = key.algorithm;
        if (typeof modulusLength !== 'number' || modulusLength < 2048) {
            throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
        }
    }
};

function isJWK$1(key) {
    return isObject$1(key) && typeof key.kty === 'string';
}
function isPrivateJWK$1(key) {
    return key.kty !== 'oct' && typeof key.d === 'string';
}
function isPublicJWK$1(key) {
    return key.kty !== 'oct' && typeof key.d === 'undefined';
}
function isSecretJWK$1(key) {
    return isJWK$1(key) && key.kty === 'oct' && typeof key.k === 'string';
}

function subtleMapping(jwk) {
    let algorithm;
    let keyUsages;
    switch (jwk.kty) {
        case 'RSA': {
            switch (jwk.alg) {
                case 'PS256':
                case 'PS384':
                case 'PS512':
                    algorithm = { name: 'RSA-PSS', hash: `SHA-${jwk.alg.slice(-3)}` };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'RS256':
                case 'RS384':
                case 'RS512':
                    algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: `SHA-${jwk.alg.slice(-3)}` };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'RSA-OAEP':
                case 'RSA-OAEP-256':
                case 'RSA-OAEP-384':
                case 'RSA-OAEP-512':
                    algorithm = {
                        name: 'RSA-OAEP',
                        hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`,
                    };
                    keyUsages = jwk.d ? ['decrypt', 'unwrapKey'] : ['encrypt', 'wrapKey'];
                    break;
                default:
                    throw new JOSENotSupported$1('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
            }
            break;
        }
        case 'EC': {
            switch (jwk.alg) {
                case 'ES256':
                    algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'ES384':
                    algorithm = { name: 'ECDSA', namedCurve: 'P-384' };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'ES512':
                    algorithm = { name: 'ECDSA', namedCurve: 'P-521' };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'ECDH-ES':
                case 'ECDH-ES+A128KW':
                case 'ECDH-ES+A192KW':
                case 'ECDH-ES+A256KW':
                    algorithm = { name: 'ECDH', namedCurve: jwk.crv };
                    keyUsages = jwk.d ? ['deriveBits'] : [];
                    break;
                default:
                    throw new JOSENotSupported$1('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
            }
            break;
        }
        case 'OKP': {
            switch (jwk.alg) {
                case 'Ed25519':
                    algorithm = { name: 'Ed25519' };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'EdDSA':
                    algorithm = { name: jwk.crv };
                    keyUsages = jwk.d ? ['sign'] : ['verify'];
                    break;
                case 'ECDH-ES':
                case 'ECDH-ES+A128KW':
                case 'ECDH-ES+A192KW':
                case 'ECDH-ES+A256KW':
                    algorithm = { name: jwk.crv };
                    keyUsages = jwk.d ? ['deriveBits'] : [];
                    break;
                default:
                    throw new JOSENotSupported$1('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
            }
            break;
        }
        default:
            throw new JOSENotSupported$1('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
    }
    return { algorithm, keyUsages };
}
const parse = async (jwk) => {
    if (!jwk.alg) {
        throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
    }
    const { algorithm, keyUsages } = subtleMapping(jwk);
    const rest = [
        algorithm,
        jwk.ext ?? false,
        jwk.key_ops ?? keyUsages,
    ];
    const keyData = { ...jwk };
    delete keyData.alg;
    delete keyData.use;
    return crypto$1.subtle.importKey('jwk', keyData, ...rest);
};
var asKeyObject = parse;

const exportKeyValue = (k) => decode$1(k);
let privCache;
let pubCache;
const isKeyObject = (key) => {
    return key?.[Symbol.toStringTag] === 'KeyObject';
};
const importAndCache = async (cache, key, jwk, alg, freeze = false) => {
    let cached = cache.get(key);
    if (cached?.[alg]) {
        return cached[alg];
    }
    const cryptoKey = await asKeyObject({ ...jwk, alg });
    if (freeze)
        Object.freeze(key);
    if (!cached) {
        cache.set(key, { [alg]: cryptoKey });
    }
    else {
        cached[alg] = cryptoKey;
    }
    return cryptoKey;
};
const normalizePublicKey = (key, alg) => {
    if (isKeyObject(key)) {
        let jwk = key.export({ format: 'jwk' });
        delete jwk.d;
        delete jwk.dp;
        delete jwk.dq;
        delete jwk.p;
        delete jwk.q;
        delete jwk.qi;
        if (jwk.k) {
            return exportKeyValue(jwk.k);
        }
        pubCache || (pubCache = new WeakMap());
        return importAndCache(pubCache, key, jwk, alg);
    }
    if (isJWK$1(key)) {
        if (key.k)
            return decode$1(key.k);
        pubCache || (pubCache = new WeakMap());
        const cryptoKey = importAndCache(pubCache, key, key, alg, true);
        return cryptoKey;
    }
    return key;
};
const normalizePrivateKey = (key, alg) => {
    if (isKeyObject(key)) {
        let jwk = key.export({ format: 'jwk' });
        if (jwk.k) {
            return exportKeyValue(jwk.k);
        }
        privCache || (privCache = new WeakMap());
        return importAndCache(privCache, key, jwk, alg);
    }
    if (isJWK$1(key)) {
        if (key.k)
            return decode$1(key.k);
        privCache || (privCache = new WeakMap());
        const cryptoKey = importAndCache(privCache, key, key, alg, true);
        return cryptoKey;
    }
    return key;
};
var normalize = { normalizePublicKey, normalizePrivateKey };

async function importJWK(jwk, alg) {
    if (!isObject$1(jwk)) {
        throw new TypeError('JWK must be an object');
    }
    alg || (alg = jwk.alg);
    switch (jwk.kty) {
        case 'oct':
            if (typeof jwk.k !== 'string' || !jwk.k) {
                throw new TypeError('missing "k" (Key Value) Parameter value');
            }
            return decode$1(jwk.k);
        case 'RSA':
            if ('oth' in jwk && jwk.oth !== undefined) {
                throw new JOSENotSupported$1('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
            }
        case 'EC':
        case 'OKP':
            return asKeyObject({ ...jwk, alg });
        default:
            throw new JOSENotSupported$1('Unsupported "kty" (Key Type) Parameter value');
    }
}

const tag$1 = (key) => key?.[Symbol.toStringTag];
const jwkMatchesOp$1 = (alg, key, usage) => {
    if (key.use !== undefined && key.use !== 'sig') {
        throw new TypeError('Invalid key for this operation, when present its use must be sig');
    }
    if (key.key_ops !== undefined && key.key_ops.includes?.(usage) !== true) {
        throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${usage}`);
    }
    if (key.alg !== undefined && key.alg !== alg) {
        throw new TypeError(`Invalid key for this operation, when present its alg must be ${alg}`);
    }
    return true;
};
const symmetricTypeCheck$1 = (alg, key, usage, allowJwk) => {
    if (key instanceof Uint8Array)
        return;
    if (allowJwk && isJWK$1(key)) {
        if (isSecretJWK$1(key) && jwkMatchesOp$1(alg, key, usage))
            return;
        throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
    }
    if (!isKeyLike$1(key)) {
        throw new TypeError(withAlg$1(alg, key, ...types$1, 'Uint8Array', allowJwk ? 'JSON Web Key' : null));
    }
    if (key.type !== 'secret') {
        throw new TypeError(`${tag$1(key)} instances for symmetric algorithms must be of type "secret"`);
    }
};
const asymmetricTypeCheck$1 = (alg, key, usage, allowJwk) => {
    if (allowJwk && isJWK$1(key)) {
        switch (usage) {
            case 'sign':
                if (isPrivateJWK$1(key) && jwkMatchesOp$1(alg, key, usage))
                    return;
                throw new TypeError(`JSON Web Key for this operation be a private JWK`);
            case 'verify':
                if (isPublicJWK$1(key) && jwkMatchesOp$1(alg, key, usage))
                    return;
                throw new TypeError(`JSON Web Key for this operation be a public JWK`);
        }
    }
    if (!isKeyLike$1(key)) {
        throw new TypeError(withAlg$1(alg, key, ...types$1, allowJwk ? 'JSON Web Key' : null));
    }
    if (key.type === 'secret') {
        throw new TypeError(`${tag$1(key)} instances for asymmetric algorithms must not be of type "secret"`);
    }
    if (usage === 'sign' && key.type === 'public') {
        throw new TypeError(`${tag$1(key)} instances for asymmetric algorithm signing must be of type "private"`);
    }
    if (usage === 'decrypt' && key.type === 'public') {
        throw new TypeError(`${tag$1(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
    if (key.algorithm && usage === 'verify' && key.type === 'private') {
        throw new TypeError(`${tag$1(key)} instances for asymmetric algorithm verifying must be of type "public"`);
    }
    if (key.algorithm && usage === 'encrypt' && key.type === 'private') {
        throw new TypeError(`${tag$1(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
};
function checkKeyType$1(allowJwk, alg, key, usage) {
    const symmetric = alg.startsWith('HS') ||
        alg === 'dir' ||
        alg.startsWith('PBES2') ||
        /^A\d{3}(?:GCM)?KW$/.test(alg);
    if (symmetric) {
        symmetricTypeCheck$1(alg, key, usage, allowJwk);
    }
    else {
        asymmetricTypeCheck$1(alg, key, usage, allowJwk);
    }
}
checkKeyType$1.bind(undefined, false);
const checkKeyTypeWithJwk = checkKeyType$1.bind(undefined, true);

function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
    if (joseHeader.crit !== undefined && protectedHeader?.crit === undefined) {
        throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
    }
    if (!protectedHeader || protectedHeader.crit === undefined) {
        return new Set();
    }
    if (!Array.isArray(protectedHeader.crit) ||
        protectedHeader.crit.length === 0 ||
        protectedHeader.crit.some((input) => typeof input !== 'string' || input.length === 0)) {
        throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
    }
    let recognized;
    if (recognizedOption !== undefined) {
        recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
    }
    else {
        recognized = recognizedDefault;
    }
    for (const parameter of protectedHeader.crit) {
        if (!recognized.has(parameter)) {
            throw new JOSENotSupported$1(`Extension Header Parameter "${parameter}" is not recognized`);
        }
        if (joseHeader[parameter] === undefined) {
            throw new Err(`Extension Header Parameter "${parameter}" is missing`);
        }
        if (recognized.get(parameter) && protectedHeader[parameter] === undefined) {
            throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
        }
    }
    return new Set(protectedHeader.crit);
}

const validateAlgorithms = (option, algorithms) => {
    if (algorithms !== undefined &&
        (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== 'string'))) {
        throw new TypeError(`"${option}" option must be an array of strings`);
    }
    if (!algorithms) {
        return undefined;
    }
    return new Set(algorithms);
};
var validateAlgorithms$1 = validateAlgorithms;

const keyToJWK = async (key) => {
    if (key instanceof Uint8Array) {
        return {
            kty: 'oct',
            k: encode(key),
        };
    }
    if (!isCryptoKey$1(key)) {
        throw new TypeError(invalidKeyInput(key, ...types$1, 'Uint8Array'));
    }
    if (!key.extractable) {
        throw new TypeError('non-extractable CryptoKey cannot be exported as a JWK');
    }
    const { ext, key_ops, alg, use, ...jwk } = await crypto$1.subtle.exportKey('jwk', key);
    return jwk;
};
var keyToJWK$1 = keyToJWK;

async function exportJWK(key) {
    return keyToJWK$1(key);
}

function subtleDsa(alg, algorithm) {
    const hash = `SHA-${alg.slice(-3)}`;
    switch (alg) {
        case 'HS256':
        case 'HS384':
        case 'HS512':
            return { hash, name: 'HMAC' };
        case 'PS256':
        case 'PS384':
        case 'PS512':
            return { hash, name: 'RSA-PSS', saltLength: alg.slice(-3) >> 3 };
        case 'RS256':
        case 'RS384':
        case 'RS512':
            return { hash, name: 'RSASSA-PKCS1-v1_5' };
        case 'ES256':
        case 'ES384':
        case 'ES512':
            return { hash, name: 'ECDSA', namedCurve: algorithm.namedCurve };
        case 'Ed25519':
            return { name: 'Ed25519' };
        case 'EdDSA':
            return { name: algorithm.name };
        default:
            throw new JOSENotSupported$1(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
    }
}

async function getCryptoKey(alg, key, usage) {
    if (usage === 'sign') {
        key = await normalize.normalizePrivateKey(key, alg);
    }
    if (usage === 'verify') {
        key = await normalize.normalizePublicKey(key, alg);
    }
    if (isCryptoKey$1(key)) {
        checkSigCryptoKey(key, alg, usage);
        return key;
    }
    if (key instanceof Uint8Array) {
        if (!alg.startsWith('HS')) {
            throw new TypeError(invalidKeyInput(key, ...types$1));
        }
        return crypto$1.subtle.importKey('raw', key, { hash: `SHA-${alg.slice(-3)}`, name: 'HMAC' }, false, [usage]);
    }
    throw new TypeError(invalidKeyInput(key, ...types$1, 'Uint8Array', 'JSON Web Key'));
}

const verify = async (alg, key, signature, data) => {
    const cryptoKey = await getCryptoKey(alg, key, 'verify');
    checkKeyLength(alg, cryptoKey);
    const algorithm = subtleDsa(alg, cryptoKey.algorithm);
    try {
        return await crypto$1.subtle.verify(algorithm, cryptoKey, signature, data);
    }
    catch {
        return false;
    }
};
var verify$1 = verify;

async function flattenedVerify(jws, key, options) {
    if (!isObject$1(jws)) {
        throw new JWSInvalid$1('Flattened JWS must be an object');
    }
    if (jws.protected === undefined && jws.header === undefined) {
        throw new JWSInvalid$1('Flattened JWS must have either of the "protected" or "header" members');
    }
    if (jws.protected !== undefined && typeof jws.protected !== 'string') {
        throw new JWSInvalid$1('JWS Protected Header incorrect type');
    }
    if (jws.payload === undefined) {
        throw new JWSInvalid$1('JWS Payload missing');
    }
    if (typeof jws.signature !== 'string') {
        throw new JWSInvalid$1('JWS Signature missing or incorrect type');
    }
    if (jws.header !== undefined && !isObject$1(jws.header)) {
        throw new JWSInvalid$1('JWS Unprotected Header incorrect type');
    }
    let parsedProt = {};
    if (jws.protected) {
        try {
            const protectedHeader = decode$1(jws.protected);
            parsedProt = JSON.parse(decoder.decode(protectedHeader));
        }
        catch {
            throw new JWSInvalid$1('JWS Protected Header is invalid');
        }
    }
    if (!isDisjoint$1(parsedProt, jws.header)) {
        throw new JWSInvalid$1('JWS Protected and JWS Unprotected Header Parameter names must be disjoint');
    }
    const joseHeader = {
        ...parsedProt,
        ...jws.header,
    };
    const extensions = validateCrit(JWSInvalid$1, new Map([['b64', true]]), options?.crit, parsedProt, joseHeader);
    let b64 = true;
    if (extensions.has('b64')) {
        b64 = parsedProt.b64;
        if (typeof b64 !== 'boolean') {
            throw new JWSInvalid$1('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
        }
    }
    const { alg } = joseHeader;
    if (typeof alg !== 'string' || !alg) {
        throw new JWSInvalid$1('JWS "alg" (Algorithm) Header Parameter missing or invalid');
    }
    const algorithms = options && validateAlgorithms$1('algorithms', options.algorithms);
    if (algorithms && !algorithms.has(alg)) {
        throw new JOSEAlgNotAllowed$1('"alg" (Algorithm) Header Parameter value not allowed');
    }
    if (b64) {
        if (typeof jws.payload !== 'string') {
            throw new JWSInvalid$1('JWS Payload must be a string');
        }
    }
    else if (typeof jws.payload !== 'string' && !(jws.payload instanceof Uint8Array)) {
        throw new JWSInvalid$1('JWS Payload must be a string or an Uint8Array instance');
    }
    let resolvedKey = false;
    if (typeof key === 'function') {
        key = await key(parsedProt, jws);
        resolvedKey = true;
        checkKeyTypeWithJwk(alg, key, 'verify');
        if (isJWK$1(key)) {
            key = await importJWK(key, alg);
        }
    }
    else {
        checkKeyTypeWithJwk(alg, key, 'verify');
    }
    const data = concat(encoder.encode(jws.protected ?? ''), encoder.encode('.'), typeof jws.payload === 'string' ? encoder.encode(jws.payload) : jws.payload);
    let signature;
    try {
        signature = decode$1(jws.signature);
    }
    catch {
        throw new JWSInvalid$1('Failed to base64url decode the signature');
    }
    const verified = await verify$1(alg, key, signature, data);
    if (!verified) {
        throw new JWSSignatureVerificationFailed$1();
    }
    let payload;
    if (b64) {
        try {
            payload = decode$1(jws.payload);
        }
        catch {
            throw new JWSInvalid$1('Failed to base64url decode the payload');
        }
    }
    else if (typeof jws.payload === 'string') {
        payload = encoder.encode(jws.payload);
    }
    else {
        payload = jws.payload;
    }
    const result = { payload };
    if (jws.protected !== undefined) {
        result.protectedHeader = parsedProt;
    }
    if (jws.header !== undefined) {
        result.unprotectedHeader = jws.header;
    }
    if (resolvedKey) {
        return { ...result, key };
    }
    return result;
}

async function compactVerify(jws, key, options) {
    if (jws instanceof Uint8Array) {
        jws = decoder.decode(jws);
    }
    if (typeof jws !== 'string') {
        throw new JWSInvalid$1('Compact JWS must be a string or Uint8Array');
    }
    const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split('.');
    if (length !== 3) {
        throw new JWSInvalid$1('Invalid Compact JWS');
    }
    const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
    const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
    if (typeof key === 'function') {
        return { ...result, key: verified.key };
    }
    return result;
}

var epoch = (date) => Math.floor(date.getTime() / 1000);

const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const year = day * 365.25;
const REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var secs = (str) => {
    const matched = REGEX.exec(str);
    if (!matched || (matched[4] && matched[1])) {
        throw new TypeError('Invalid time period format');
    }
    const value = parseFloat(matched[2]);
    const unit = matched[3].toLowerCase();
    let numericDate;
    switch (unit) {
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
        case 's':
            numericDate = Math.round(value);
            break;
        case 'minute':
        case 'minutes':
        case 'min':
        case 'mins':
        case 'm':
            numericDate = Math.round(value * minute);
            break;
        case 'hour':
        case 'hours':
        case 'hr':
        case 'hrs':
        case 'h':
            numericDate = Math.round(value * hour);
            break;
        case 'day':
        case 'days':
        case 'd':
            numericDate = Math.round(value * day);
            break;
        case 'week':
        case 'weeks':
        case 'w':
            numericDate = Math.round(value * week);
            break;
        default:
            numericDate = Math.round(value * year);
            break;
    }
    if (matched[1] === '-' || matched[4] === 'ago') {
        return -numericDate;
    }
    return numericDate;
};

const normalizeTyp = (value) => value.toLowerCase().replace(/^application\//, '');
const checkAudiencePresence = (audPayload, audOption) => {
    if (typeof audPayload === 'string') {
        return audOption.includes(audPayload);
    }
    if (Array.isArray(audPayload)) {
        return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
    }
    return false;
};
var jwtPayload = (protectedHeader, encodedPayload, options = {}) => {
    let payload;
    try {
        payload = JSON.parse(decoder.decode(encodedPayload));
    }
    catch {
    }
    if (!isObject$1(payload)) {
        throw new JWTInvalid$1('JWT Claims Set must be a top-level JSON object');
    }
    const { typ } = options;
    if (typ &&
        (typeof protectedHeader.typ !== 'string' ||
            normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
        throw new JWTClaimValidationFailed$1('unexpected "typ" JWT header value', payload, 'typ', 'check_failed');
    }
    const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
    const presenceCheck = [...requiredClaims];
    if (maxTokenAge !== undefined)
        presenceCheck.push('iat');
    if (audience !== undefined)
        presenceCheck.push('aud');
    if (subject !== undefined)
        presenceCheck.push('sub');
    if (issuer !== undefined)
        presenceCheck.push('iss');
    for (const claim of new Set(presenceCheck.reverse())) {
        if (!(claim in payload)) {
            throw new JWTClaimValidationFailed$1(`missing required "${claim}" claim`, payload, claim, 'missing');
        }
    }
    if (issuer &&
        !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
        throw new JWTClaimValidationFailed$1('unexpected "iss" claim value', payload, 'iss', 'check_failed');
    }
    if (subject && payload.sub !== subject) {
        throw new JWTClaimValidationFailed$1('unexpected "sub" claim value', payload, 'sub', 'check_failed');
    }
    if (audience &&
        !checkAudiencePresence(payload.aud, typeof audience === 'string' ? [audience] : audience)) {
        throw new JWTClaimValidationFailed$1('unexpected "aud" claim value', payload, 'aud', 'check_failed');
    }
    let tolerance;
    switch (typeof options.clockTolerance) {
        case 'string':
            tolerance = secs(options.clockTolerance);
            break;
        case 'number':
            tolerance = options.clockTolerance;
            break;
        case 'undefined':
            tolerance = 0;
            break;
        default:
            throw new TypeError('Invalid clockTolerance option type');
    }
    const { currentDate } = options;
    const now = epoch(currentDate || new Date());
    if ((payload.iat !== undefined || maxTokenAge) && typeof payload.iat !== 'number') {
        throw new JWTClaimValidationFailed$1('"iat" claim must be a number', payload, 'iat', 'invalid');
    }
    if (payload.nbf !== undefined) {
        if (typeof payload.nbf !== 'number') {
            throw new JWTClaimValidationFailed$1('"nbf" claim must be a number', payload, 'nbf', 'invalid');
        }
        if (payload.nbf > now + tolerance) {
            throw new JWTClaimValidationFailed$1('"nbf" claim timestamp check failed', payload, 'nbf', 'check_failed');
        }
    }
    if (payload.exp !== undefined) {
        if (typeof payload.exp !== 'number') {
            throw new JWTClaimValidationFailed$1('"exp" claim must be a number', payload, 'exp', 'invalid');
        }
        if (payload.exp <= now - tolerance) {
            throw new JWTExpired$1('"exp" claim timestamp check failed', payload, 'exp', 'check_failed');
        }
    }
    if (maxTokenAge) {
        const age = now - payload.iat;
        const max = typeof maxTokenAge === 'number' ? maxTokenAge : secs(maxTokenAge);
        if (age - tolerance > max) {
            throw new JWTExpired$1('"iat" claim timestamp check failed (too far in the past)', payload, 'iat', 'check_failed');
        }
        if (age < 0 - tolerance) {
            throw new JWTClaimValidationFailed$1('"iat" claim timestamp check failed (it should be in the past)', payload, 'iat', 'check_failed');
        }
    }
    return payload;
};

async function jwtVerify(jwt, key, options) {
    const verified = await compactVerify(jwt, key, options);
    if (verified.protectedHeader.crit?.includes('b64') && verified.protectedHeader.b64 === false) {
        throw new JWTInvalid$1('JWTs MUST NOT use unencoded payload');
    }
    const payload = jwtPayload(verified.protectedHeader, verified.payload, options);
    const result = { payload, protectedHeader: verified.protectedHeader };
    if (typeof key === 'function') {
        return { ...result, key: verified.key };
    }
    return result;
}

const sign = async (alg, key, data) => {
    const cryptoKey = await getCryptoKey(alg, key, 'sign');
    checkKeyLength(alg, cryptoKey);
    const signature = await crypto$1.subtle.sign(subtleDsa(alg, cryptoKey.algorithm), cryptoKey, data);
    return new Uint8Array(signature);
};
var sign$1 = sign;

class FlattenedSign {
    constructor(payload) {
        if (!(payload instanceof Uint8Array)) {
            throw new TypeError('payload must be an instance of Uint8Array');
        }
        this._payload = payload;
    }
    setProtectedHeader(protectedHeader) {
        if (this._protectedHeader) {
            throw new TypeError('setProtectedHeader can only be called once');
        }
        this._protectedHeader = protectedHeader;
        return this;
    }
    setUnprotectedHeader(unprotectedHeader) {
        if (this._unprotectedHeader) {
            throw new TypeError('setUnprotectedHeader can only be called once');
        }
        this._unprotectedHeader = unprotectedHeader;
        return this;
    }
    async sign(key, options) {
        if (!this._protectedHeader && !this._unprotectedHeader) {
            throw new JWSInvalid$1('either setProtectedHeader or setUnprotectedHeader must be called before #sign()');
        }
        if (!isDisjoint$1(this._protectedHeader, this._unprotectedHeader)) {
            throw new JWSInvalid$1('JWS Protected and JWS Unprotected Header Parameter names must be disjoint');
        }
        const joseHeader = {
            ...this._protectedHeader,
            ...this._unprotectedHeader,
        };
        const extensions = validateCrit(JWSInvalid$1, new Map([['b64', true]]), options?.crit, this._protectedHeader, joseHeader);
        let b64 = true;
        if (extensions.has('b64')) {
            b64 = this._protectedHeader.b64;
            if (typeof b64 !== 'boolean') {
                throw new JWSInvalid$1('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
            }
        }
        const { alg } = joseHeader;
        if (typeof alg !== 'string' || !alg) {
            throw new JWSInvalid$1('JWS "alg" (Algorithm) Header Parameter missing or invalid');
        }
        checkKeyTypeWithJwk(alg, key, 'sign');
        let payload = this._payload;
        if (b64) {
            payload = encoder.encode(encode(payload));
        }
        let protectedHeader;
        if (this._protectedHeader) {
            protectedHeader = encoder.encode(encode(JSON.stringify(this._protectedHeader)));
        }
        else {
            protectedHeader = encoder.encode('');
        }
        const data = concat(protectedHeader, encoder.encode('.'), payload);
        const signature = await sign$1(alg, key, data);
        const jws = {
            signature: encode(signature),
            payload: '',
        };
        if (b64) {
            jws.payload = decoder.decode(payload);
        }
        if (this._unprotectedHeader) {
            jws.header = this._unprotectedHeader;
        }
        if (this._protectedHeader) {
            jws.protected = decoder.decode(protectedHeader);
        }
        return jws;
    }
}

class CompactSign {
    constructor(payload) {
        this._flattened = new FlattenedSign(payload);
    }
    setProtectedHeader(protectedHeader) {
        this._flattened.setProtectedHeader(protectedHeader);
        return this;
    }
    async sign(key, options) {
        const jws = await this._flattened.sign(key, options);
        if (jws.payload === undefined) {
            throw new TypeError('use the flattened module for creating JWS with b64: false');
        }
        return `${jws.protected}.${jws.payload}.${jws.signature}`;
    }
}

function validateInput(label, input) {
    if (!Number.isFinite(input)) {
        throw new TypeError(`Invalid ${label} input`);
    }
    return input;
}
class ProduceJWT {
    constructor(payload = {}) {
        if (!isObject$1(payload)) {
            throw new TypeError('JWT Claims Set MUST be an object');
        }
        this._payload = payload;
    }
    setIssuer(issuer) {
        this._payload = { ...this._payload, iss: issuer };
        return this;
    }
    setSubject(subject) {
        this._payload = { ...this._payload, sub: subject };
        return this;
    }
    setAudience(audience) {
        this._payload = { ...this._payload, aud: audience };
        return this;
    }
    setJti(jwtId) {
        this._payload = { ...this._payload, jti: jwtId };
        return this;
    }
    setNotBefore(input) {
        if (typeof input === 'number') {
            this._payload = { ...this._payload, nbf: validateInput('setNotBefore', input) };
        }
        else if (input instanceof Date) {
            this._payload = { ...this._payload, nbf: validateInput('setNotBefore', epoch(input)) };
        }
        else {
            this._payload = { ...this._payload, nbf: epoch(new Date()) + secs(input) };
        }
        return this;
    }
    setExpirationTime(input) {
        if (typeof input === 'number') {
            this._payload = { ...this._payload, exp: validateInput('setExpirationTime', input) };
        }
        else if (input instanceof Date) {
            this._payload = { ...this._payload, exp: validateInput('setExpirationTime', epoch(input)) };
        }
        else {
            this._payload = { ...this._payload, exp: epoch(new Date()) + secs(input) };
        }
        return this;
    }
    setIssuedAt(input) {
        if (typeof input === 'undefined') {
            this._payload = { ...this._payload, iat: epoch(new Date()) };
        }
        else if (input instanceof Date) {
            this._payload = { ...this._payload, iat: validateInput('setIssuedAt', epoch(input)) };
        }
        else if (typeof input === 'string') {
            this._payload = {
                ...this._payload,
                iat: validateInput('setIssuedAt', epoch(new Date()) + secs(input)),
            };
        }
        else {
            this._payload = { ...this._payload, iat: validateInput('setIssuedAt', input) };
        }
        return this;
    }
}

class SignJWT extends ProduceJWT {
    setProtectedHeader(protectedHeader) {
        this._protectedHeader = protectedHeader;
        return this;
    }
    async sign(key, options) {
        const sig = new CompactSign(encoder.encode(JSON.stringify(this._payload)));
        sig.setProtectedHeader(this._protectedHeader);
        if (Array.isArray(this._protectedHeader?.crit) &&
            this._protectedHeader.crit.includes('b64') &&
            this._protectedHeader.b64 === false) {
            throw new JWTInvalid$1('JWTs MUST NOT use unencoded payload');
        }
        return sig.sign(key, options);
    }
}

const check = (value, description) => {
    if (typeof value !== 'string' || !value) {
        throw new JWKInvalid$1(`${description} missing or invalid`);
    }
};
async function calculateJwkThumbprint(jwk, digestAlgorithm) {
    if (!isObject$1(jwk)) {
        throw new TypeError('JWK must be an object');
    }
    digestAlgorithm ?? (digestAlgorithm = 'sha256');
    if (digestAlgorithm !== 'sha256' &&
        digestAlgorithm !== 'sha384' &&
        digestAlgorithm !== 'sha512') {
        throw new TypeError('digestAlgorithm must one of "sha256", "sha384", or "sha512"');
    }
    let components;
    switch (jwk.kty) {
        case 'EC':
            check(jwk.crv, '"crv" (Curve) Parameter');
            check(jwk.x, '"x" (X Coordinate) Parameter');
            check(jwk.y, '"y" (Y Coordinate) Parameter');
            components = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
            break;
        case 'OKP':
            check(jwk.crv, '"crv" (Subtype of Key Pair) Parameter');
            check(jwk.x, '"x" (Public Key) Parameter');
            components = { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
            break;
        case 'RSA':
            check(jwk.e, '"e" (Exponent) Parameter');
            check(jwk.n, '"n" (Modulus) Parameter');
            components = { e: jwk.e, kty: jwk.kty, n: jwk.n };
            break;
        case 'oct':
            check(jwk.k, '"k" (Key Value) Parameter');
            components = { k: jwk.k, kty: jwk.kty };
            break;
        default:
            throw new JOSENotSupported$1('"kty" (Key Type) Parameter missing or unsupported');
    }
    const data = encoder.encode(JSON.stringify(components));
    return encode(await digest$1(digestAlgorithm, data));
}

function getKtyFromAlg(alg) {
    switch (typeof alg === 'string' && alg.slice(0, 2)) {
        case 'RS':
        case 'PS':
            return 'RSA';
        case 'ES':
            return 'EC';
        case 'Ed':
            return 'OKP';
        default:
            throw new JOSENotSupported$1('Unsupported "alg" value for a JSON Web Key Set');
    }
}
function isJWKSLike(jwks) {
    return (jwks &&
        typeof jwks === 'object' &&
        Array.isArray(jwks.keys) &&
        jwks.keys.every(isJWKLike));
}
function isJWKLike(key) {
    return isObject$1(key);
}
function clone(obj) {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
}
class LocalJWKSet {
    constructor(jwks) {
        this._cached = new WeakMap();
        if (!isJWKSLike(jwks)) {
            throw new JWKSInvalid$1('JSON Web Key Set malformed');
        }
        this._jwks = clone(jwks);
    }
    async getKey(protectedHeader, token) {
        const { alg, kid } = { ...protectedHeader, ...token?.header };
        const kty = getKtyFromAlg(alg);
        const candidates = this._jwks.keys.filter((jwk) => {
            let candidate = kty === jwk.kty;
            if (candidate && typeof kid === 'string') {
                candidate = kid === jwk.kid;
            }
            if (candidate && typeof jwk.alg === 'string') {
                candidate = alg === jwk.alg;
            }
            if (candidate && typeof jwk.use === 'string') {
                candidate = jwk.use === 'sig';
            }
            if (candidate && Array.isArray(jwk.key_ops)) {
                candidate = jwk.key_ops.includes('verify');
            }
            if (candidate) {
                switch (alg) {
                    case 'ES256':
                        candidate = jwk.crv === 'P-256';
                        break;
                    case 'ES256K':
                        candidate = jwk.crv === 'secp256k1';
                        break;
                    case 'ES384':
                        candidate = jwk.crv === 'P-384';
                        break;
                    case 'ES512':
                        candidate = jwk.crv === 'P-521';
                        break;
                    case 'Ed25519':
                        candidate = jwk.crv === 'Ed25519';
                        break;
                    case 'EdDSA':
                        candidate = jwk.crv === 'Ed25519' || jwk.crv === 'Ed448';
                        break;
                }
            }
            return candidate;
        });
        const { 0: jwk, length } = candidates;
        if (length === 0) {
            throw new JWKSNoMatchingKey$1();
        }
        if (length !== 1) {
            const error = new JWKSMultipleMatchingKeys$1();
            const { _cached } = this;
            error[Symbol.asyncIterator] = async function* () {
                for (const jwk of candidates) {
                    try {
                        yield await importWithAlgCache(_cached, jwk, alg);
                    }
                    catch { }
                }
            };
            throw error;
        }
        return importWithAlgCache(this._cached, jwk, alg);
    }
}
async function importWithAlgCache(cache, jwk, alg) {
    const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk);
    if (cached[alg] === undefined) {
        const key = await importJWK({ ...jwk, ext: true }, alg);
        if (key instanceof Uint8Array || key.type !== 'public') {
            throw new JWKSInvalid$1('JSON Web Key Set members must be public keys');
        }
        cached[alg] = key;
    }
    return cached[alg];
}
function createLocalJWKSet(jwks) {
    const set = new LocalJWKSet(jwks);
    const localJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
    Object.defineProperties(localJWKSet, {
        jwks: {
            value: () => clone(set._jwks),
            enumerable: true,
            configurable: false,
            writable: false,
        },
    });
    return localJWKSet;
}

const fetchJwks = async (url, timeout, options) => {
    let controller;
    let id;
    let timedOut = false;
    if (typeof AbortController === 'function') {
        controller = new AbortController();
        id = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);
    }
    const response = await fetch(url.href, {
        signal: controller ? controller.signal : undefined,
        redirect: 'manual',
        headers: options.headers,
    }).catch((err) => {
        if (timedOut)
            throw new JWKSTimeout$1();
        throw err;
    });
    if (id !== undefined)
        clearTimeout(id);
    if (response.status !== 200) {
        throw new JOSEError$1('Expected 200 OK from the JSON Web Key Set HTTP response');
    }
    try {
        return await response.json();
    }
    catch {
        throw new JOSEError$1('Failed to parse the JSON Web Key Set HTTP response as JSON');
    }
};
var fetchJwks$1 = fetchJwks;

function isCloudflareWorkers() {
    return (typeof WebSocketPair !== 'undefined' ||
        (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') ||
        (typeof EdgeRuntime !== 'undefined' && EdgeRuntime === 'vercel'));
}
let USER_AGENT;
if (typeof navigator === 'undefined' || !navigator.userAgent?.startsWith?.('Mozilla/5.0 ')) {
    const NAME = 'jose';
    const VERSION = 'v5.10.0';
    USER_AGENT = `${NAME}/${VERSION}`;
}
const jwksCache = Symbol();
function isFreshJwksCache(input, cacheMaxAge) {
    if (typeof input !== 'object' || input === null) {
        return false;
    }
    if (!('uat' in input) || typeof input.uat !== 'number' || Date.now() - input.uat >= cacheMaxAge) {
        return false;
    }
    if (!('jwks' in input) ||
        !isObject$1(input.jwks) ||
        !Array.isArray(input.jwks.keys) ||
        !Array.prototype.every.call(input.jwks.keys, isObject$1)) {
        return false;
    }
    return true;
}
class RemoteJWKSet {
    constructor(url, options) {
        if (!(url instanceof URL)) {
            throw new TypeError('url must be an instance of URL');
        }
        this._url = new URL(url.href);
        this._options = { agent: options?.agent, headers: options?.headers };
        this._timeoutDuration =
            typeof options?.timeoutDuration === 'number' ? options?.timeoutDuration : 5000;
        this._cooldownDuration =
            typeof options?.cooldownDuration === 'number' ? options?.cooldownDuration : 30000;
        this._cacheMaxAge = typeof options?.cacheMaxAge === 'number' ? options?.cacheMaxAge : 600000;
        if (options?.[jwksCache] !== undefined) {
            this._cache = options?.[jwksCache];
            if (isFreshJwksCache(options?.[jwksCache], this._cacheMaxAge)) {
                this._jwksTimestamp = this._cache.uat;
                this._local = createLocalJWKSet(this._cache.jwks);
            }
        }
    }
    coolingDown() {
        return typeof this._jwksTimestamp === 'number'
            ? Date.now() < this._jwksTimestamp + this._cooldownDuration
            : false;
    }
    fresh() {
        return typeof this._jwksTimestamp === 'number'
            ? Date.now() < this._jwksTimestamp + this._cacheMaxAge
            : false;
    }
    async getKey(protectedHeader, token) {
        if (!this._local || !this.fresh()) {
            await this.reload();
        }
        try {
            return await this._local(protectedHeader, token);
        }
        catch (err) {
            if (err instanceof JWKSNoMatchingKey$1) {
                if (this.coolingDown() === false) {
                    await this.reload();
                    return this._local(protectedHeader, token);
                }
            }
            throw err;
        }
    }
    async reload() {
        if (this._pendingFetch && isCloudflareWorkers()) {
            this._pendingFetch = undefined;
        }
        const headers = new Headers(this._options.headers);
        if (USER_AGENT && !headers.has('User-Agent')) {
            headers.set('User-Agent', USER_AGENT);
            this._options.headers = Object.fromEntries(headers.entries());
        }
        this._pendingFetch || (this._pendingFetch = fetchJwks$1(this._url, this._timeoutDuration, this._options)
            .then((json) => {
            this._local = createLocalJWKSet(json);
            if (this._cache) {
                this._cache.uat = Date.now();
                this._cache.jwks = json;
            }
            this._jwksTimestamp = Date.now();
            this._pendingFetch = undefined;
        })
            .catch((err) => {
            this._pendingFetch = undefined;
            throw err;
        }));
        await this._pendingFetch;
    }
}
function createRemoteJWKSet(url, options) {
    const set = new RemoteJWKSet(url, options);
    const remoteJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
    Object.defineProperties(remoteJWKSet, {
        coolingDown: {
            get: () => set.coolingDown(),
            enumerable: true,
            configurable: false,
        },
        fresh: {
            get: () => set.fresh(),
            enumerable: true,
            configurable: false,
        },
        reload: {
            value: () => set.reload(),
            enumerable: true,
            configurable: false,
            writable: false,
        },
        reloading: {
            get: () => !!set._pendingFetch,
            enumerable: true,
            configurable: false,
        },
        jwks: {
            value: () => set._local?.jwks(),
            enumerable: true,
            configurable: false,
            writable: false,
        },
    });
    return remoteJWKSet;
}

const decode = decode$1;

function decodeJwt(jwt) {
    if (typeof jwt !== 'string')
        throw new JWTInvalid$1('JWTs must use Compact JWS serialization, JWT must be a string');
    const { 1: payload, length } = jwt.split('.');
    if (length === 5)
        throw new JWTInvalid$1('Only JWTs using Compact JWS serialization can be decoded');
    if (length !== 3)
        throw new JWTInvalid$1('Invalid JWT');
    if (!payload)
        throw new JWTInvalid$1('JWTs must contain a payload');
    let decoded;
    try {
        decoded = decode(payload);
    }
    catch {
        throw new JWTInvalid$1('Failed to base64url decode the payload');
    }
    let result;
    try {
        result = JSON.parse(decoder.decode(decoded));
    }
    catch {
        throw new JWTInvalid$1('Failed to parse the decoded payload as JSON');
    }
    if (!isObject$1(result))
        throw new JWTInvalid$1('Invalid JWT Claims Set');
    return result;
}

function getModulusLengthOption(options) {
    const modulusLength = options?.modulusLength ?? 2048;
    if (typeof modulusLength !== 'number' || modulusLength < 2048) {
        throw new JOSENotSupported$1('Invalid or unsupported modulusLength option provided, 2048 bits or larger keys must be used');
    }
    return modulusLength;
}
async function generateKeyPair$1(alg, options) {
    let algorithm;
    let keyUsages;
    switch (alg) {
        case 'PS256':
        case 'PS384':
        case 'PS512':
            algorithm = {
                name: 'RSA-PSS',
                hash: `SHA-${alg.slice(-3)}`,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                modulusLength: getModulusLengthOption(options),
            };
            keyUsages = ['sign', 'verify'];
            break;
        case 'RS256':
        case 'RS384':
        case 'RS512':
            algorithm = {
                name: 'RSASSA-PKCS1-v1_5',
                hash: `SHA-${alg.slice(-3)}`,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                modulusLength: getModulusLengthOption(options),
            };
            keyUsages = ['sign', 'verify'];
            break;
        case 'RSA-OAEP':
        case 'RSA-OAEP-256':
        case 'RSA-OAEP-384':
        case 'RSA-OAEP-512':
            algorithm = {
                name: 'RSA-OAEP',
                hash: `SHA-${parseInt(alg.slice(-3), 10) || 1}`,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                modulusLength: getModulusLengthOption(options),
            };
            keyUsages = ['decrypt', 'unwrapKey', 'encrypt', 'wrapKey'];
            break;
        case 'ES256':
            algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
            keyUsages = ['sign', 'verify'];
            break;
        case 'ES384':
            algorithm = { name: 'ECDSA', namedCurve: 'P-384' };
            keyUsages = ['sign', 'verify'];
            break;
        case 'ES512':
            algorithm = { name: 'ECDSA', namedCurve: 'P-521' };
            keyUsages = ['sign', 'verify'];
            break;
        case 'Ed25519':
            algorithm = { name: 'Ed25519' };
            keyUsages = ['sign', 'verify'];
            break;
        case 'EdDSA': {
            keyUsages = ['sign', 'verify'];
            const crv = 'Ed25519';
            switch (crv) {
                case 'Ed25519':
                case 'Ed448':
                    algorithm = { name: crv };
                    break;
                default:
                    throw new JOSENotSupported$1('Invalid or unsupported crv option provided');
            }
            break;
        }
        case 'ECDH-ES':
        case 'ECDH-ES+A128KW':
        case 'ECDH-ES+A192KW':
        case 'ECDH-ES+A256KW': {
            keyUsages = ['deriveKey', 'deriveBits'];
            const crv = 'P-256';
            switch (crv) {
                case 'P-256':
                case 'P-384':
                case 'P-521': {
                    algorithm = { name: 'ECDH', namedCurve: crv };
                    break;
                }
                case 'X25519':
                case 'X448':
                    algorithm = { name: crv };
                    break;
                default:
                    throw new JOSENotSupported$1('Invalid or unsupported crv option provided, supported values are P-256, P-384, P-521, X25519, and X448');
            }
            break;
        }
        default:
            throw new JOSENotSupported$1('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
    }
    return crypto$1.subtle.generateKey(algorithm, false, keyUsages);
}

async function generateKeyPair(alg, options) {
    return generateKeyPair$1(alg, options);
}

/**
 * When the client does not have a webid profile document, use this.
 *
 * @param registration_endpoint
 * @param redirect__uris
 * @returns
 */
const requestDynamicClientRegistration = async (registration_endpoint, client_details) => {
    // prepare dynamic client registration
    const client_registration_request_body = {
        ...client_details,
        grant_types: ["authorization_code", "refresh_token"],
        // id_token_signed_response_alg: "ES256", // omitting as NSS does not support ES256 while CSS does not support RS256
        token_endpoint_auth_method: "none",
        application_type: "web",
        subject_type: "public",
    };
    // register
    return fetch(registration_endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(client_registration_request_body),
    });
};

/**
 * Login with the idp, using a provided `client_id` or dynamic client registration if none provided.
 *
 * @param idp
 * @param redirect_uri
 */
const redirectForLogin = async (idp, redirect_uri, client_details) => {
    // RFC 6749 - Section 3.1.2 - sanitize redirect_uri
    const redirect_uri_ = new URL(redirect_uri);
    const redirect_uri_sane = redirect_uri_.origin + redirect_uri_.pathname + redirect_uri_.search;
    // lookup openid configuration of idp
    const idp_origin = new URL(idp).origin;
    const openid_configuration = await fetch(`${idp_origin}/.well-known/openid-configuration`)
        .then((response) => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    });
    // RFC 9207 iss check: remember the identity provider (idp) / issuer (iss) - relaxing for trailing slash
    const issuer = openid_configuration["issuer"];
    const trim_trailing_slash = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
    if (trim_trailing_slash(idp) !== trim_trailing_slash(issuer)) { // expected idp matches received issuer mod trailing slash?
        throw new Error("RFC 9207 - iss !== idp - " + issuer + " !== " + idp);
    }
    sessionStorage.setItem("idp", issuer);
    // remember token endpoint
    sessionStorage.setItem("token_endpoint", openid_configuration["token_endpoint"]);
    // remember jwks_uri for later token verification
    sessionStorage.setItem("jwks_uri", openid_configuration["jwks_uri"]);
    let client_id = client_details?.client_id;
    // no client_id => attempt dynamic registration
    if (!client_id) {
        // use registration endpoint
        const registration_endpoint = openid_configuration["registration_endpoint"];
        // get client registration
        const client_registration = await requestDynamicClientRegistration(registration_endpoint, client_details ?? { redirect_uris: [redirect_uri_sane] })
            .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        });
        client_id = client_registration["client_id"];
    }
    // remember client_id if not URL
    try {
        new URL(client_id);
    }
    catch {
        sessionStorage.setItem("client_id", client_id);
    }
    // RFC 7636 PKCE, remember code verifer
    const { pkce_code_verifier, pkce_code_challenge } = await getPKCEcode();
    sessionStorage.setItem("pkce_code_verifier", pkce_code_verifier);
    // RFC 6749 OAuth 2.0 - CSRF token
    const csrf_token = window.crypto.randomUUID();
    sessionStorage.setItem("csrf_token", csrf_token);
    // redirect to idp
    const redirect_to_idp = openid_configuration["authorization_endpoint"] +
        `?response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirect_uri_sane)}` +
        `&scope=openid offline_access webid` +
        `&client_id=${encodeURIComponent(client_id)}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${pkce_code_challenge}` +
        `&state=${csrf_token}` +
        `&prompt=consent`; // this query parameter value MUST be present for CSS v7 to issue a refresh token ( // TODO open issue because prompting is the default behaviour but without this query param no refresh token is provided despite the "remember this client" box being checked)
    window.location.href = redirect_to_idp;
};
/**
 * RFC 7636 PKCE
 * @returns PKCE code verifier and PKCE code challenge
 */
const getPKCEcode = async () => {
    // create random string as PKCE code verifier
    const pkce_code_verifier = window.crypto.randomUUID() + "-" + window.crypto.randomUUID();
    // hash the verifier and base64URL encode as PKCE code challenge
    const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(pkce_code_verifier)));
    const pkce_code_challenge = btoa(String.fromCharCode(...digest))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return { pkce_code_verifier, pkce_code_challenge };
};
/**
 * On incoming redirect from OpenID provider (idp/iss),
 * URL contains authrization code, issuer (idp) and state (csrf token),
 * get an access token for the authrization code.
 */
const onIncomingRedirect = async (client_details, database) => {
    const url = new URL(window.location.href);
    // authorization code
    const authorization_code = url.searchParams.get("code");
    // if no code, session remains unauthenticated at this point
    if (authorization_code === null) {
        return { clientDetails: client_details };
    }
    // RFC 9207 issuer check
    const idp = sessionStorage.getItem("idp");
    if (idp === null || url.searchParams.get("iss") !== idp) {
        throw new Error("RFC 9207 - iss !== idp - " + url.searchParams.get("iss") + " !== " + idp);
    }
    // RFC 6749 OAuth 2.0
    if (url.searchParams.get("state") !== sessionStorage.getItem("csrf_token")) {
        throw new Error("RFC 6749 - state !== csrf_token - " + url.searchParams.get("state") + " !== " + sessionStorage.getItem("csrf_token"));
    }
    // remove redirect query parameters from URL
    url.searchParams.delete("iss");
    url.searchParams.delete("state");
    url.searchParams.delete("code");
    window.history.pushState({}, document.title, url.toString());
    // prepare token request
    const pkce_code_verifier = sessionStorage.getItem("pkce_code_verifier");
    if (pkce_code_verifier === null) {
        throw new Error("Access Token Request preparation - Could not find in sessionStorage: pkce_code_verifier");
    }
    const client_id = client_details?.client_id || sessionStorage.getItem("client_id");
    if (!client_id) {
        throw new Error("Access Token Request preparation - Could not find in sessionStorage: client_id (dynamic registration)");
    }
    const token_endpoint = sessionStorage.getItem("token_endpoint");
    if (token_endpoint === null) {
        throw new Error("Access Token Request preparation - Could not find in sessionStorage: token_endpoint");
    }
    // RFC 9449 DPoP
    const key_pair = await generateKeyPair("ES256");
    // get access token
    const token_response = await requestAccessToken(authorization_code, pkce_code_verifier, url.toString(), client_id, token_endpoint, key_pair)
        .then((response) => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    });
    // verify access_token // ! Solid-OIDC specification says it should be a dpop-bound `id token` but implementations provide a dpop-bound `access token`
    const accessToken = token_response["access_token"];
    const jwks_uri = sessionStorage.getItem("jwks_uri");
    if (jwks_uri === null) {
        throw new Error("Access Token validation preparation - Could not find in sessionStorage: jwks_uri");
    }
    const jwks = createRemoteJWKSet(new URL(jwks_uri));
    const { payload } = await jwtVerify(accessToken, jwks, {
        issuer: idp, // RFC 9207
        audience: "solid", // RFC 7519 // ! "solid" as per implementations ...
        // exp, nbf, iat - handled automatically
    });
    // check dpop thumbprint
    const dpopThumbprint = await calculateJwkThumbprint(await exportJWK(key_pair.publicKey));
    if (payload["cnf"]["jkt"] !== dpopThumbprint) {
        throw new Error("Access Token validation failed on `jkt`: jkt !== DPoP thumbprint - " + payload["cnf"]["jkt"] + " !== " + dpopThumbprint);
    }
    // check client_id
    if (payload["client_id"] !== client_id) {
        throw new Error("Access Token validation failed on `client_id`: JWT payload !== client_id - " + payload["client_id"] + " !== " + client_id);
    }
    // summarise session info
    const token_details = { ...token_response, dpop_key_pair: key_pair };
    const idp_details = { idp, jwks_uri, token_endpoint };
    if (!client_details)
        client_details = { redirect_uris: [url.toString()] };
    client_details.client_id = client_id;
    // and persist refresh token details
    if (database) {
        await database.init();
        await Promise.all([
            database.setItem("idp", idp),
            database.setItem("jwks_uri", jwks_uri),
            database.setItem("token_endpoint", token_endpoint),
            database.setItem("client_id", client_id),
            database.setItem("dpop_keypair", key_pair),
            database.setItem("refresh_token", token_response["refresh_token"])
        ]);
        database.close();
    }
    // clean session storage
    sessionStorage.removeItem("csrf_token");
    sessionStorage.removeItem("pkce_code_verifier");
    sessionStorage.removeItem("idp");
    sessionStorage.removeItem("jwks_uri");
    sessionStorage.removeItem("token_endpoint");
    sessionStorage.removeItem("client_id");
    // return session information
    return {
        clientDetails: client_details,
        idpDetails: idp_details,
        tokenDetails: token_details
    };
};
/**
 * Request an dpop-bound access token from a token endpoint
 * @param authorization_code
 * @param pkce_code_verifier
 * @param redirect_uri
 * @param client_id
 * @param token_endpoint
 * @param key_pair
 * @returns
 */
const requestAccessToken = async (authorization_code, pkce_code_verifier, redirect_uri, client_id, token_endpoint, key_pair) => {
    // prepare public key to bind access token to
    const jwk_public_key = await exportJWK(key_pair.publicKey);
    jwk_public_key.alg = "ES256";
    // sign the access token request DPoP token
    const dpop = await new SignJWT({
        htu: token_endpoint,
        htm: "POST",
    })
        .setIssuedAt()
        .setJti(window.crypto.randomUUID())
        .setProtectedHeader({
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: jwk_public_key,
    })
        .sign(key_pair.privateKey);
    return fetch(token_endpoint, {
        method: "POST",
        headers: {
            dpop,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: authorization_code,
            code_verifier: pkce_code_verifier,
            redirect_uri: redirect_uri,
            client_id: client_id,
        }),
    });
};

const renewTokens = async (sessionDatabase) => {
    // remember session details
    try {
        await sessionDatabase.init();
        const client_id = await sessionDatabase.getItem("client_id");
        const token_endpoint = await sessionDatabase.getItem("token_endpoint");
        const key_pair = await sessionDatabase.getItem("dpop_keypair");
        const refresh_token = await sessionDatabase.getItem("refresh_token");
        if (client_id === null || token_endpoint === null || key_pair === null || refresh_token === null) {
            // we can not restore the old session
            throw new Error("Could not refresh tokens: details missing from database.");
        }
        const token_response = await requestFreshTokens(refresh_token, client_id, token_endpoint, key_pair)
            .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        });
        // verify access_token // ! Solid-OIDC specification says it should be a dpop-bound `id token` but implementations provide a dpop-bound `access token`
        const accessToken = token_response["access_token"];
        const idp = await sessionDatabase.getItem("idp");
        if (idp === null) {
            throw new Error("Access Token validation preparation - Could not find in sessionDatabase: idp");
        }
        const jwks_uri = await sessionDatabase.getItem("jwks_uri");
        if (jwks_uri === null) {
            throw new Error("Access Token validation preparation - Could not find in sessionDatabase: jwks_uri");
        }
        const jwks = createRemoteJWKSet(new URL(jwks_uri));
        const { payload } = await jwtVerify(accessToken, jwks, {
            issuer: idp, // RFC 9207
            audience: "solid", // RFC 7519 // ! "solid" as per implementations ...
            // exp, nbf, iat - handled automatically
        });
        // check dpop thumbprint
        const dpopThumbprint = await calculateJwkThumbprint(await exportJWK(key_pair.publicKey));
        if (payload["cnf"]["jkt"] !== dpopThumbprint) {
            throw new Error("Access Token validation failed on `jkt`: jkt !== DPoP thumbprint - " + payload["cnf"]["jkt"] + " !== " + dpopThumbprint);
        }
        // check client_id
        if (payload["client_id"] !== client_id) {
            throw new Error("Access Token validation failed on `client_id`: JWT payload !== client_id - " + payload["client_id"] + " !== " + client_id);
        }
        // set new refresh token for token rotation
        await sessionDatabase.setItem("refresh_token", token_response["refresh_token"]);
        return {
            ...token_response,
            dpop_key_pair: key_pair,
        };
    }
    finally {
        sessionDatabase.close();
    }
};
/**
 * Request an dpop-bound access token from a token endpoint using a refresh token
 * @param authorization_code
 * @param pkce_code_verifier
 * @param redirect_uri
 * @param client_id
 * @param token_endpoint
 * @param key_pair
 * @returns
 */
const requestFreshTokens = async (refresh_token, client_id, token_endpoint, key_pair) => {
    // prepare public key to bind access token to
    const jwk_public_key = await exportJWK(key_pair.publicKey);
    jwk_public_key.alg = "ES256";
    // sign the access token request DPoP token
    const dpop = await new SignJWT({
        htu: token_endpoint,
        htm: "POST",
    })
        .setIssuedAt()
        .setJti(self.crypto.randomUUID())
        .setProtectedHeader({
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: jwk_public_key,
    })
        .sign(key_pair.privateKey);
    return fetch(token_endpoint, {
        method: "POST",
        headers: {
            dpop,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token,
            client_id
        }),
    });
};

var SessionEvents$1;
(function (SessionEvents) {
    SessionEvents["STATE_CHANGE"] = "sessionStateChange";
    SessionEvents["EXPIRATION_WARNING"] = "sessionExpirationWarning";
    SessionEvents["EXPIRATION"] = "sessionExpiration";
})(SessionEvents$1 || (SessionEvents$1 = {}));
//
//
//  Basic implementation
//
//
/**
 * The SessionCore class manages session state and core logic but does not handle the refresh lifecycle.
 * It receives {@link SessionOptions} with a database to be able to restore a session.
 * That database can be re-used by (your!) surrounding implementation to handle the refresh lifecycle.
 * If no database was provided, refresh information cannot be stored, and thus token refresh (via the refresh token grant) is not possible in this case.
 *
 * If you are building a web app, use the Session implementation provided in the default `/web` version of this library.
 */
class SessionCore extends EventTarget {
    isActive_ = false;
    exp_;
    webId_ = undefined;
    currentAth_ = undefined;
    information;
    database;
    refreshPromise;
    resolveRefresh;
    rejectRefresh;
    constructor(clientDetails, sessionOptions) {
        super();
        this.authFetch = this.authFetch.bind(this);
        this.information = { clientDetails };
        this.database = sessionOptions?.database;
        if (sessionOptions?.onSessionStateChange)
            this.addEventListener(SessionEvents$1.STATE_CHANGE, (event) => sessionOptions.onSessionStateChange?.(event));
        if (sessionOptions?.onSessionExpirationWarning)
            this.addEventListener(SessionEvents$1.EXPIRATION_WARNING, (event) => sessionOptions?.onSessionExpirationWarning?.(event));
        if (sessionOptions?.onSessionExpiration)
            this.addEventListener(SessionEvents$1.EXPIRATION, (event) => sessionOptions?.onSessionExpiration?.(event));
    }
    async login(idp, redirect_uri) {
        await redirectForLogin(idp, redirect_uri, this.information.clientDetails);
    }
    /**
     * Handles the redirect from the identity provider after a login attempt.
     * It attempts to retrieve tokens using the authorization code.
     * Upon success, it tries to persist information to refresh tokens in the session database.
     * If no database was provided, no information is persisted.
     */
    async handleRedirectFromLogin() {
        // Redirect after Authorization Code Grant // memory via sessionStorage
        const newSessionInfo = await onIncomingRedirect(this.information.clientDetails, this.database);
        // no session - we remain unauthenticated
        if (!newSessionInfo.tokenDetails)
            return;
        // we got a session
        this.information.clientDetails = newSessionInfo.clientDetails;
        this.information.idpDetails = newSessionInfo.idpDetails;
        await this.setTokenDetails(newSessionInfo.tokenDetails);
        // callback state change 
        this.dispatchStateChangeEvent(); // we logged in
    }
    /**
     * Handles session restoration using the refresh token grant.
     */
    async restore() {
        if (!this.database) {
            throw new Error("Could not refresh tokens: missing database. Provide database in sessionOption.");
        }
        if (this.refreshPromise) {
            return this.refreshPromise;
        }
        this.refreshPromise = new Promise((resolve, reject) => {
            this.resolveRefresh = resolve;
            this.rejectRefresh = reject;
        });
        // Restore session using Refresh Token Grant 
        const wasActive = this.isActive;
        renewTokens(this.database)
            .then(tokenDetails => this.setTokenDetails(tokenDetails))
            .then(() => this.resolveRefresh())
            .catch(error => {
            if (this.isActive) {
                this.rejectRefresh(new Error(error || 'Token refresh failed'));
                // do not change state (yet), let the app decide if they want to logout or if they just want to retry.
                if (!this.isExpired()) {
                    this.dispatchExpirationWarningEvent();
                }
                else {
                    this.dispatchExpirationEvent();
                }
            }
            else {
                this.rejectRefresh(new Error("No session to restore."));
            }
        }).finally(() => {
            this.clearRefreshPromise();
            if (wasActive !== this.isActive)
                this.dispatchStateChangeEvent();
        });
        return this.refreshPromise;
    }
    /**
     * This logs the user out.
     * Clears all session-related information, including IDP details and tokens.
     * Client ID is preserved if it is a URI.
     */
    async logout() {
        // clean session data
        this.isActive_ = false;
        this.exp_ = undefined;
        this.webId_ = undefined;
        this.currentAth_ = undefined;
        this.information.idpDetails = undefined;
        this.information.tokenDetails = undefined;
        // client details are preserved
        if (this.refreshPromise && this.rejectRefresh) {
            this.rejectRefresh(new Error('Logout during token refresh.'));
            this.clearRefreshPromise();
        }
        // clean session database
        if (this.database) {
            await this.database.init();
            await this.database.clear();
            this.database.close();
        }
        // callback state change
        this.dispatchStateChangeEvent(); // we logged out
    }
    /**
     * Makes an HTTP fetch request.
     * If a session is active, it includes the DPoP token and the access token in the `Authorization` header.
     *
     * @param input The URL or Request object to fetch.
     * @param init Optional fetch request options (RequestInit). Headers for `Authorization` and `DPoP` will be overwritten if a session is active.
     * @param dpopPayload Optional payload for the DPoP token. If provided, it overrides the default `htu` and `htm` claims.
     * @returns A promise that resolves to the fetch Response.
     */
    async authFetch(input, init, dpopPayload) {
        // if there is not session established, just delegate to the default fetch
        if (!this.isActive) {
            return fetch(input, init);
        }
        // TODO
        // TODO do HEAD request to check if authentication is actually required, only then include tokens
        // TODO
        // prepare authenticated call using a DPoP token (either provided payload, or default)
        let url;
        let method;
        let headers;
        // wrangle fetch input parameters into place
        if (input instanceof Request) {
            url = new URL(input.url);
            method = init?.method || input?.method || 'GET';
            headers = new Headers(input.headers);
        }
        else {
            init = init || {};
            url = new URL(input.toString());
            method = init.method || 'GET';
            headers = init.headers ? new Headers(init.headers) : new Headers();
        }
        // create DPoP token, and add tokens to request
        await this._renewTokensIfExpired();
        dpopPayload = dpopPayload ?? {
            htu: `${url.origin}${url.pathname}`,
            htm: method.toUpperCase()
        };
        const dpop = await this._createSignedDPoPToken(dpopPayload);
        // overwrite headers: authorization, dpop
        headers.set("dpop", dpop);
        headers.set("authorization", `DPoP ${this.information.tokenDetails.access_token}`);
        // check explicitly; to avoid unexpected behaviour
        if (input instanceof Request) { // clone the provided request, and override the headers
            return fetch(new Request(input, { ...init, headers }));
        }
        // just override the headers
        return fetch(url, { ...init, headers });
    }
    // 
    // Setters
    //
    async setTokenDetails(tokenDetails) {
        this.information.tokenDetails = tokenDetails;
        await this._updateSessionDetailsFromToken(tokenDetails.access_token);
    }
    clearRefreshPromise() {
        this.refreshPromise = undefined;
        this.resolveRefresh = undefined;
        this.rejectRefresh = undefined;
    }
    //
    // Getters
    //
    get isActive() {
        return this.isActive_;
    }
    get webId() {
        return this.webId_;
    }
    isExpired() {
        if (!this.exp_)
            return true;
        return this._isTokenExpired(this.exp_);
    }
    getExpiresIn() {
        if (!this.exp_)
            return -1;
        return this._getTokenTTL(this.exp_);
    }
    getTokenDetails() {
        return this.information.tokenDetails;
    }
    //
    // Helpers
    //
    /**
     * Check if the current token is expired (which may happen during device/browser/tab hibernation),
     * and if expired, restore the session.
     */
    async _renewTokensIfExpired() {
        if (this.isExpired()) {
            if (!this.refreshPromise) {
                await this.restore(); // Initiate and wait
            }
            else {
                await this.refreshPromise; // Wait for already pending
            }
        }
    }
    /**
     * RFC 9449 - Hash of the access token
     */
    async _computeAth(accessToken) {
        // Convert the ASCII string of the token to a Uint8Array
        const encoder = new TextEncoder();
        const data = encoder.encode(accessToken); // ASCII by default
        // Compute SHA-256 hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        // Convert ArrayBuffer to base64url string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const base64 = btoa(String.fromCharCode(...hashArray));
        // Convert base64 to base64url
        const base64url = base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return base64url;
    }
    /**
     * Creates a signed DPoP (Demonstration of Proof-of-Possession) token.
     *
     * @param payload The payload to include in the DPoP token. By default, it includes `htu` (HTTP target URI) and `htm` (HTTP method).
     * @returns A promise that resolves to the signed DPoP token string.
     * @throws Error if the session has not been initialized - if no token details are available.
     */
    async _createSignedDPoPToken(payload) {
        if (!this.information.tokenDetails || !this.currentAth_) {
            throw new Error("Session not established.");
        }
        payload.ath = this.currentAth_;
        const jwk_public_key = await exportJWK(this.information.tokenDetails.dpop_key_pair.publicKey);
        return new SignJWT(payload)
            .setIssuedAt()
            .setJti(window.crypto.randomUUID())
            .setProtectedHeader({
            alg: "ES256",
            typ: "dpop+jwt",
            jwk: jwk_public_key,
        })
            .sign(this.information.tokenDetails.dpop_key_pair.privateKey);
    }
    async _updateSessionDetailsFromToken(access_token) {
        if (!access_token) {
            await this.logout();
            return;
        }
        try {
            const decodedToken = decodeJwt(access_token);
            const webId = decodedToken.webid;
            if (!webId) {
                throw new Error('Missing webid claim in access token');
            }
            const exp = decodedToken.exp;
            if (!exp) {
                throw new Error('Missing exp claim in access token');
            }
            this.currentAth_ = await this._computeAth(access_token); // must be done before session set to active
            this.webId_ = webId;
            this.exp_ = exp;
            this.isActive_ = true;
        }
        catch (error) {
            await this.logout();
        }
    }
    /**
      * Checks if a JWT expiration timestamp ('exp') has passed.
      */
    _isTokenExpired(exp, bufferSeconds = 0) {
        if (typeof exp !== 'number' || isNaN(exp)) {
            return true;
        }
        return this._getTokenTTL(exp, bufferSeconds) < 0;
    }
    _getTokenTTL(exp, bufferSeconds = 0) {
        const currentTimeSeconds = Math.floor(Date.now() / 1000);
        return exp - (currentTimeSeconds + bufferSeconds);
    }
    // 
    // Events
    //
    dispatchStateChangeEvent() {
        this.dispatchEvent(new CustomEvent(SessionEvents$1.STATE_CHANGE, { detail: { isActive: this.isActive, webId: this.webId } }));
    }
    dispatchExpirationWarningEvent() {
        this.dispatchEvent(new CustomEvent(SessionEvents$1.EXPIRATION_WARNING, { detail: { expires_in: this.getExpiresIn() } }));
    }
    dispatchExpirationEvent() {
        this.dispatchEvent(new CustomEvent(SessionEvents$1.EXPIRATION));
    }
}

const isCryptoKey = (key) => key instanceof CryptoKey;

new TextEncoder();
new TextDecoder();

class JOSEError extends Error {
    constructor(message, options) {
        super(message, options);
        this.code = 'ERR_JOSE_GENERIC';
        this.name = this.constructor.name;
        Error.captureStackTrace?.(this, this.constructor);
    }
}
JOSEError.code = 'ERR_JOSE_GENERIC';
class JWTClaimValidationFailed extends JOSEError {
    constructor(message, payload, claim = 'unspecified', reason = 'unspecified') {
        super(message, { cause: { claim, reason, payload } });
        this.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
    }
}
JWTClaimValidationFailed.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
class JWTExpired extends JOSEError {
    constructor(message, payload, claim = 'unspecified', reason = 'unspecified') {
        super(message, { cause: { claim, reason, payload } });
        this.code = 'ERR_JWT_EXPIRED';
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
    }
}
JWTExpired.code = 'ERR_JWT_EXPIRED';
class JOSEAlgNotAllowed extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JOSE_ALG_NOT_ALLOWED';
    }
}
JOSEAlgNotAllowed.code = 'ERR_JOSE_ALG_NOT_ALLOWED';
class JOSENotSupported extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JOSE_NOT_SUPPORTED';
    }
}
JOSENotSupported.code = 'ERR_JOSE_NOT_SUPPORTED';
class JWEDecryptionFailed extends JOSEError {
    constructor(message = 'decryption operation failed', options) {
        super(message, options);
        this.code = 'ERR_JWE_DECRYPTION_FAILED';
    }
}
JWEDecryptionFailed.code = 'ERR_JWE_DECRYPTION_FAILED';
class JWEInvalid extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWE_INVALID';
    }
}
JWEInvalid.code = 'ERR_JWE_INVALID';
class JWSInvalid extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWS_INVALID';
    }
}
JWSInvalid.code = 'ERR_JWS_INVALID';
class JWTInvalid extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWT_INVALID';
    }
}
JWTInvalid.code = 'ERR_JWT_INVALID';
class JWKInvalid extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWK_INVALID';
    }
}
JWKInvalid.code = 'ERR_JWK_INVALID';
class JWKSInvalid extends JOSEError {
    constructor() {
        super(...arguments);
        this.code = 'ERR_JWKS_INVALID';
    }
}
JWKSInvalid.code = 'ERR_JWKS_INVALID';
class JWKSNoMatchingKey extends JOSEError {
    constructor(message = 'no applicable key found in the JSON Web Key Set', options) {
        super(message, options);
        this.code = 'ERR_JWKS_NO_MATCHING_KEY';
    }
}
JWKSNoMatchingKey.code = 'ERR_JWKS_NO_MATCHING_KEY';
class JWKSMultipleMatchingKeys extends JOSEError {
    constructor(message = 'multiple matching keys found in the JSON Web Key Set', options) {
        super(message, options);
        this.code = 'ERR_JWKS_MULTIPLE_MATCHING_KEYS';
    }
}
JWKSMultipleMatchingKeys.code = 'ERR_JWKS_MULTIPLE_MATCHING_KEYS';
class JWKSTimeout extends JOSEError {
    constructor(message = 'request timed out', options) {
        super(message, options);
        this.code = 'ERR_JWKS_TIMEOUT';
    }
}
JWKSTimeout.code = 'ERR_JWKS_TIMEOUT';
class JWSSignatureVerificationFailed extends JOSEError {
    constructor(message = 'signature verification failed', options) {
        super(message, options);
        this.code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
    }
}
JWSSignatureVerificationFailed.code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';

function message(msg, actual, ...types) {
    types = types.filter(Boolean);
    if (types.length > 2) {
        const last = types.pop();
        msg += `one of type ${types.join(', ')}, or ${last}.`;
    }
    else if (types.length === 2) {
        msg += `one of type ${types[0]} or ${types[1]}.`;
    }
    else {
        msg += `of type ${types[0]}.`;
    }
    if (actual == null) {
        msg += ` Received ${actual}`;
    }
    else if (typeof actual === 'function' && actual.name) {
        msg += ` Received function ${actual.name}`;
    }
    else if (typeof actual === 'object' && actual != null) {
        if (actual.constructor?.name) {
            msg += ` Received an instance of ${actual.constructor.name}`;
        }
    }
    return msg;
}
function withAlg(alg, actual, ...types) {
    return message(`Key for the ${alg} algorithm must be `, actual, ...types);
}

var isKeyLike = (key) => {
    if (isCryptoKey(key)) {
        return true;
    }
    return key?.[Symbol.toStringTag] === 'KeyObject';
};
const types = ['CryptoKey'];

function isObjectLike(value) {
    return typeof value === 'object' && value !== null;
}
function isObject(input) {
    if (!isObjectLike(input) || Object.prototype.toString.call(input) !== '[object Object]') {
        return false;
    }
    if (Object.getPrototypeOf(input) === null) {
        return true;
    }
    let proto = input;
    while (Object.getPrototypeOf(proto) !== null) {
        proto = Object.getPrototypeOf(proto);
    }
    return Object.getPrototypeOf(input) === proto;
}

function isJWK(key) {
    return isObject(key) && typeof key.kty === 'string';
}
function isPrivateJWK(key) {
    return key.kty !== 'oct' && typeof key.d === 'string';
}
function isPublicJWK(key) {
    return key.kty !== 'oct' && typeof key.d === 'undefined';
}
function isSecretJWK(key) {
    return isJWK(key) && key.kty === 'oct' && typeof key.k === 'string';
}

const tag = (key) => key?.[Symbol.toStringTag];
const jwkMatchesOp = (alg, key, usage) => {
    if (key.use !== undefined && key.use !== 'sig') {
        throw new TypeError('Invalid key for this operation, when present its use must be sig');
    }
    if (key.key_ops !== undefined && key.key_ops.includes?.(usage) !== true) {
        throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${usage}`);
    }
    if (key.alg !== undefined && key.alg !== alg) {
        throw new TypeError(`Invalid key for this operation, when present its alg must be ${alg}`);
    }
    return true;
};
const symmetricTypeCheck = (alg, key, usage, allowJwk) => {
    if (key instanceof Uint8Array)
        return;
    if (allowJwk && isJWK(key)) {
        if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
            return;
        throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
    }
    if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, ...types, 'Uint8Array', allowJwk ? 'JSON Web Key' : null));
    }
    if (key.type !== 'secret') {
        throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
    }
};
const asymmetricTypeCheck = (alg, key, usage, allowJwk) => {
    if (allowJwk && isJWK(key)) {
        switch (usage) {
            case 'sign':
                if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
                    return;
                throw new TypeError(`JSON Web Key for this operation be a private JWK`);
            case 'verify':
                if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
                    return;
                throw new TypeError(`JSON Web Key for this operation be a public JWK`);
        }
    }
    if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, ...types, allowJwk ? 'JSON Web Key' : null));
    }
    if (key.type === 'secret') {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
    }
    if (usage === 'sign' && key.type === 'public') {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
    }
    if (usage === 'decrypt' && key.type === 'public') {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
    if (key.algorithm && usage === 'verify' && key.type === 'private') {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
    }
    if (key.algorithm && usage === 'encrypt' && key.type === 'private') {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
};
function checkKeyType(allowJwk, alg, key, usage) {
    const symmetric = alg.startsWith('HS') ||
        alg === 'dir' ||
        alg.startsWith('PBES2') ||
        /^A\d{3}(?:GCM)?KW$/.test(alg);
    if (symmetric) {
        symmetricTypeCheck(alg, key, usage, allowJwk);
    }
    else {
        asymmetricTypeCheck(alg, key, usage, allowJwk);
    }
}
checkKeyType.bind(undefined, false);
checkKeyType.bind(undefined, true);
if (typeof navigator === 'undefined' || !navigator.userAgent?.startsWith?.('Mozilla/5.0 ')) ;

var SessionEvents;
(function (SessionEvents) {
    SessionEvents["STATE_CHANGE"] = "sessionStateChange";
    SessionEvents["EXPIRATION_WARNING"] = "sessionExpirationWarning";
    SessionEvents["EXPIRATION"] = "sessionExpiration";
})(SessionEvents || (SessionEvents = {}));

var RefreshMessageTypes;
(function (RefreshMessageTypes) {
    RefreshMessageTypes["SCHEDULE"] = "SCHEDULE";
    RefreshMessageTypes["REFRESH"] = "REFRESH";
    RefreshMessageTypes["STOP"] = "STOP";
    RefreshMessageTypes["DISCONNECT"] = "DISCONNECT";
    RefreshMessageTypes["TOKEN_DETAILS"] = "TOKEN_DETAILS";
    RefreshMessageTypes["ERROR_ON_REFRESH"] = "ERROR_ON_REFRESH";
    RefreshMessageTypes["EXPIRED"] = "EXPIRED";
})(RefreshMessageTypes || (RefreshMessageTypes = {}));

/**
 * A simple IndexedDB wrapper.
 */
class SessionIDB {
    dbName;
    storeName;
    dbVersion;
    db = null;
    /**
     * Creates a new instance
     * @param dbName The name of the IndexedDB database
     * @param storeName The name of the object store
     * @param dbVersion The database version
     */
    constructor(dbName = 'soidc', storeName = 'session', dbVersion = 1) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.dbVersion = dbVersion;
    }
    /**
     * Initializes the IndexedDB database
     * @returns Promise that resolves when the database is ready
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (event) => {
                reject(new Error(`Database error: ${event.target.error}`));
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Check if the object store already exists, if not create it
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }
    /**
     * Stores any value in the database with the given ID as key
     * @param id The identifier/key for the value
     * @param value The value to store
     */
    async setItem(id, value) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            // Handle transation
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = (event) => {
                reject(new Error(`Transaction error for setItem(${id},...): ${event.target.error}`));
            };
            transaction.onabort = (event) => {
                reject(new Error(`Transaction aborted for setItem(${id},...): ${event.target.error}`));
            };
            // Perform the request within the transaction
            const store = transaction.objectStore(this.storeName);
            store.put(value, id);
        });
    }
    /**
      * Retrieves a value from the database by ID
      * @param id The identifier/key for the value
      * @returns The stored value or null if not found
      */
    async getItem(id) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            // Handle transation
            transaction.onerror = (event) => {
                reject(new Error(`Transaction error for getItem(${id}): ${event.target.error}`));
            };
            transaction.onabort = (event) => {
                reject(new Error(`Transaction aborted for getItem(${id}): ${event.target.error}`));
            };
            // Perform the request within the transaction
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => {
                resolve(request.result || null);
            };
        });
    }
    /**
     * Removes an item from the database
     * @param id The identifier of the item to remove
     */
    async deleteItem(id) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            // Handle transation
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = (event) => {
                reject(new Error(`Transaction error for deleteItem(${id}): ${event.target.error}`));
            };
            transaction.onabort = (event) => {
                reject(new Error(`Transaction aborted for deleteItem(${id}): ${event.target.error}`));
            };
            // Perform the request within the transaction
            const store = transaction.objectStore(this.storeName);
            store.delete(id);
        });
    }
    /**
     * Clears all items from the database
     */
    async clear() {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            // Handle transation
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = (event) => {
                reject(new Error(`Transaction error for clear(): ${event.target.error}`));
            };
            transaction.onabort = (event) => {
                reject(new Error(`Transaction aborted for clear(): ${event.target.error}`));
            };
            // Perform the request within the transaction
            const store = transaction.objectStore(this.storeName);
            store.clear();
        });
    }
    /**
     * Closes the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

export { SessionCore as Session, SessionCore, SessionEvents$1 as SessionEvents, SessionIDB };
