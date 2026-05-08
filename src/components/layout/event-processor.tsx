/**
 * Previously: a client-side component that polled /api/events/process.
 *
 * Removed: event processing is now piggy-backed on existing read endpoints
 * (GET /api/metrics, GET /api/orders, GET /api/orders/[id]) which every page
 * already polls. This eliminates a dedicated request class from the dev-server
 * log and is a better fit for a serverless deployment.
 *
 * The /api/events/process route still exists for manual invocation (seed
 * scripts, demo mode, external triggers).
 */
