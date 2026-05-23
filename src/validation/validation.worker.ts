import { SchemaParser } from '../parser/SchemaParser'
import { SchemaValidator } from './SchemaValidator'
import type { IXsd, ValidationError } from '../types'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import type { ISchemaParser } from '../interfaces/ISchemaParser'

// ─── Message types ────────────────────────────────────────────────────────────

interface ValidateRequest {
    id: string
    xml: string
    xsds: IXsd[]
}

interface ValidateResponse {
    id: string
    errors: ValidationError[]
}

// ─── Simple non-cryptographic hash for cache-key generation ──────────────────

function simpleHash(s: string): string {
    let h = 0
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0
    }
    return h.toString(36)
}

// ─── Parser cache keyed by path + content hash ────────────────────────────────

const parserCache = new Map<string, ISchemaParser>()

function getParser(xsd: IXsd): ISchemaParser {
    const key = `${xsd.path}:${simpleHash(xsd.value)}`
    const hit = parserCache.get(key)
    if (hit) return hit

    // Remove stale entry for this path (same path, different content)
    for (const k of parserCache.keys()) {
        if (k.startsWith(`${xsd.path}:`)) {
            parserCache.delete(k)
            break
        }
    }

    const parser = new SchemaParser(xsd)
    parserCache.set(key, parser)
    return parser
}

// ─── ISchemaParser → ISchemaWorker adapter ─────────────────────────────────────────

function parserToWorker(xsd: IXsd, parser: ISchemaParser): ISchemaWorker {
    const w: ISchemaWorker = {
        xsd,
        withNamespace: () => w,
        doCompletion: () => [],
        getRootElements: () => parser.getRootElements(),
        getSubElements: (name, anc) => parser.getSubElements(name, anc),
        getFirstSubElements: (name, wa) => parser.getFirstSubElements(name, wa),
        getAttributesForElement: (name) => parser.getAttributesForElement(name),
        getEnumValuesForAttribute: (elem, attr) => parser.getEnumValuesForAttribute(elem, attr),
        getEnumValuesForNamedType: (type) => parser.getEnumValuesForNamedType(type),
        getContentModelType: (name) => parser.getContentModelType(name),
    }
    return w
}

// ─── Worker message handler ───────────────────────────────────────────────────

const validator = new SchemaValidator()

// `self` is Window in DOM context but DedicatedWorkerGlobalScope in a worker.
// Cast to the minimal shape we need to avoid requiring the webworker lib.
const workerSelf = self as unknown as {
    addEventListener(type: 'message', handler: (event: MessageEvent) => void): void
    postMessage(data: unknown): void
}

workerSelf.addEventListener('message', (event: MessageEvent) => {
    const req = event.data as ValidateRequest
    const workers = req.xsds.map(xsd => parserToWorker(xsd, getParser(xsd)))
    const errors = validator.validate(req.xml, workers)
    const response: ValidateResponse = { id: req.id, errors }
    workerSelf.postMessage(response)
})
