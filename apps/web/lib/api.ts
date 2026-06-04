const API_BASE = {
  AUTH: "https://higoverse-auth.vercel.app",
  PRODUCTS: "https://higoverse-products.vercel.app",
  SUPPLIERS: "https://higoverse-suppliers.vercel.app",
} as const;

/**
 * Central API endpoints
 * Clean + scalable for microservices architecture
 */
export const API = {
  auth: {
    login: `${API_BASE.AUTH}/auth/login`,
    register: `${API_BASE.AUTH}/auth/register`,
  },

  products: {
    list: `${API_BASE.PRODUCTS}/products`,
    create: `${API_BASE.PRODUCTS}/products`,
    byId: (id: string) => `${API_BASE.PRODUCTS}/products/${id}`,
    update: (id: string) => `${API_BASE.PRODUCTS}/products/${id}`,
    delete: (id: string) => `${API_BASE.PRODUCTS}/products/${id}`,
  },

  suppliers: {
    list: `${API_BASE.SUPPLIERS}/suppliers`,
    create: `${API_BASE.SUPPLIERS}/suppliers`,
    byId: (id: string) => `${API_BASE.SUPPLIERS}/suppliers/${id}`,
    update: (id: string) => `${API_BASE.SUPPLIERS}/suppliers/${id}`,
    delete: (id: string) => `${API_BASE.SUPPLIERS}/suppliers/${id}`,
  },
} as const;