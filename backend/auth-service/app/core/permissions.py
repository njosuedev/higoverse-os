ADMIN_PERMISSIONS = [
    "products", "categories", "inventory", "purchases", "sales",
    "customers", "suppliers", "expenses", "reports", "settings", "staff",
]

# Default permission slugs granted to each staff role at creation time.
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin":       ADMIN_PERMISSIONS,
    "owner":       ADMIN_PERMISSIONS,
    "manager":     ["products", "categories", "inventory", "purchases", "sales",
                     "customers", "suppliers", "expenses", "reports"],
    "cashier":     ["sales", "customers"],
    "storekeeper": ["products", "categories", "inventory", "purchases", "suppliers"],
    "accountant":  ["expenses", "reports", "sales", "purchases"],
}


def default_permissions(role: str) -> list[str]:
    return ROLE_PERMISSIONS.get(role, [])
