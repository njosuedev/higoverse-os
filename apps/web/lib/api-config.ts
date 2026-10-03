// Where the browser reaches each backend service.
//
// Defaults are same-origin paths: on the VPS nginx forwards /svc/<name>/ to
// the service (deploy/nginx-higoverse.conf), and in local development
// next.config.ts forwards the same paths to 127.0.0.1:8000–8008. So the app
// works the same everywhere without any env file; NEXT_PUBLIC_* variables
// can still override a URL if a service ever moves.
export const AUTH_API     = process.env.NEXT_PUBLIC_AUTH_API      || "/svc/auth";
export const PRODUCT_API  = process.env.NEXT_PUBLIC_PRODUCT_API   || "/svc/products";
export const SUPPLIER_API = process.env.NEXT_PUBLIC_API_SUPPLIERS || "/svc/suppliers";
export const SALE_API     = process.env.NEXT_PUBLIC_API_SALES     || "/svc/sales";
export const SETTINGS_API = process.env.NEXT_PUBLIC_API_SETTINGS  || "/svc/settings";
export const REPORT_API   = process.env.NEXT_PUBLIC_API_REPORTS   || "/svc/reports";
