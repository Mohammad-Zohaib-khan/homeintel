import * as svc from '../services/neighborhoodService.js';
import { ok, created } from '../utils/respond.js';

const h = (fn) => (req, res, next) => fn(req, res).catch(next);

export const search = h(async (req, res) => {
  const { weights, ...q } = req.valid.query;
  const r = await svc.search(q, svc.weightsFor(req, weights));
  ok(res, r.items, r.meta);
});
export const facets = h(async (_req, res) => ok(res, await svc.facets()));
export const profile = h(async (req, res) => ok(res, await svc.profile(req.valid.params.id, svc.weightsFor(req, req.valid.query.weights))));
export const metrics = h(async (req, res) => ok(res, await svc.metrics(req.valid.params.id)));
export const sources = h(async (req, res) => ok(res, await svc.sources(req.valid.params.id)));
export const history = h(async (req, res) => ok(res, await svc.history(req.valid.params.id, req.valid.query.key)));
export const pois = h(async (req, res) => ok(res, await svc.pois(req.valid.params.id, req.valid.query)));
export const quality = h(async (req, res) => ok(res, await svc.quality(req.valid.params.id)));
export const compare = h(async (req, res) => ok(res, await svc.compare(req.valid.body.ids, svc.weightsFor(req, req.valid.body.weights))));
export const lookup = h(async (req, res) => ok(res, await svc.lookup(req.valid.query.q)));
export const create = h(async (req, res) => created(res, await svc.createFromLookup(req, req.valid.body)));
export const refresh = h(async (req, res) => ok(res, await svc.refresh(req, req.valid.params.id)));
