"use client";

import { useEffect, useMemo, useState } from "react";
import { productRequest } from "@/lib/product-api";
import { supplierRequest } from "@/lib/supplier-api";

import {
  Package,
  AlertCircle,
  Search,
  Filter,
  Plus,
  Trash2,
  Pencil,
  X,
  Boxes,
  DollarSign,
  Activity,
} from "lucide-react";

function timeAgo(dateString?: string) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  const now = new Date();

  const diff = Math.floor(
    (now.getTime() - date.getTime()) / 1000
  );

  if (diff < 60) return "now";
  if (diff < 3600)
    return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} hr ago`;

  return `${Math.floor(diff / 86400)} day ago`;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [creating, setCreating] = useState(false);

  const [deletingId, setDeletingId] =
    useState<string>("");

  const [editingProduct, setEditingProduct] =
  useState<any>(null);

const [updating, setUpdating] =
  useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    cost_price: "",
    selling_price: "",
    quantity: "",
    supplier_id: "",
  });

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData(false);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const [productsRes, suppliersRes] =
        await Promise.all([
          productRequest("/products"),
          supplierRequest("/suppliers"),
        ]);

      setProducts(productsRes?.data?.items || []);

      setSuppliers(
        suppliersRes?.data?.items ||
          suppliersRes?.data ||
          []
      );

      setLastUpdated(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function createProduct() {
    try {
      setCreating(true);

      await productRequest("/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          cost_price: Number(form.cost_price),
          selling_price: Number(
            form.selling_price
          ),
          quantity: Number(form.quantity),
          supplier_id:
            form.supplier_id || null,
        }),
      });

      setForm({
        name: "",
        description: "",
        cost_price: "",
        selling_price: "",
        quantity: "",
        supplier_id: "",
      });

      setShowCreateModal(false);

      await loadData(false);
    } catch (error) {
      console.error(error);
      alert("Failed to create product");
    } finally {
      setCreating(false);
    }
  }

  async function deleteProduct(id: string) {
    const confirmed = window.confirm(
      "Delete this product?"
    );

    if (!confirmed) return;

    try {
      setDeletingId(id);

      await productRequest(`/products/${id}`, {
        method: "DELETE",
      });

      await loadData(false);
    } catch (error) {
      console.error(error);
      alert("Failed to delete product");
    } finally {
      setDeletingId("");
    }
  }

  function openEdit(product: any) {
  setEditingProduct({
    ...product,
    cost_price: String(product.cost_price),
    selling_price: String(product.selling_price),
    quantity: String(product.quantity),
  });
 }

 async function updateProduct() {
  if (!editingProduct) return;

  try {
    setUpdating(true);

    await productRequest(
      `/products/${editingProduct.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          name: editingProduct.name,
          description:
            editingProduct.description,
          cost_price: Number(
            editingProduct.cost_price
          ),
          selling_price: Number(
            editingProduct.selling_price
          ),
          quantity: Number(
            editingProduct.quantity
          ),
          supplier_id:
            editingProduct.supplier_id || null,
        }),
      }
    );

    setEditingProduct(null);

    await loadData(false);
  } catch (error) {
    console.error(error);
    alert("Failed to update product");
  } finally {
    setUpdating(false);
  }
}

  const supplierMap = useMemo(() => {
    const map: Record<string, any> = {};

    suppliers.forEach((s) => {
      map[s.id] = s;
    });

    return map;
  }, [suppliers]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) =>
        p.name
          ?.toLowerCase()
          .includes(search.toLowerCase())
      )
      .filter((p) => {
        if (filter === "all") return true;

        if (filter === "in_stock")
          return p.quantity > 10;

        if (filter === "low_stock")
          return (
            p.quantity > 0 &&
            p.quantity <= 10
          );

        if (filter === "out_stock")
          return p.quantity === 0;

        return true;
      });
  }, [products, search, filter]);

  const stats = useMemo(() => {
    const total = products.length;

    const inStock = products.filter(
      (p) => p.quantity > 10
    ).length;

    const lowStock = products.filter(
      (p) =>
        p.quantity > 0 &&
        p.quantity <= 10
    ).length;

    const outStock = products.filter(
      (p) => p.quantity === 0
    ).length;

    const totalProfit = products.reduce(
      (sum, p) => {
        const profit =
          (p.selling_price || 0) -
          (p.cost_price || 0);

        return (
          sum + (profit > 0 ? profit : 0)
        );
      },
      0
    );

    return {
      total,
      inStock,
      lowStock,
      outStock,
      totalProfit,
    };
  }, [products]);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl p-6 mb-6">

        <div className="flex justify-between items-center">

          <div className="flex items-center gap-3">
            <Package />
            <h1 className="text-xl font-bold">
              Product Inventory
            </h1>
          </div>

          <div className="flex items-center gap-3">

            <button
              onClick={() =>
                setShowCreateModal(true)
              }
              className="bg-white text-blue-700 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold"
            >
              <Plus size={18} />
              Add Product
            </button>

            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live Sync
            </div>

          </div>
        </div>

        <p className="text-blue-100 text-sm mt-2">
          Last update:{" "}
          {lastUpdated
            ? lastUpdated.toLocaleTimeString()
            : "—"}
        </p>

        <div className="mt-4 flex flex-col md:flex-row gap-3">

          <div className="flex-1 flex items-center bg-white/10 rounded-xl px-3 py-2">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search product..."
              className="bg-transparent outline-none w-full ml-2"
            />
          </div>

          <div className="flex items-center bg-white/10 rounded-xl px-3 py-2 gap-2">
            <Filter size={18} />

            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value)
              }
              className="bg-transparent outline-none"
            >
              <option value="all" className="text-gray-500">
                All
              </option>
              <option value="in_stock" className="text-gray-500">
                In Stock
              </option>
              <option value="low_stock" className="text-gray-500">
                Low Stock
              </option>
              <option value="out_stock" className="text-gray-500">
                Out Stock
              </option>
            </select>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">

        <div className="bg-white rounded-2xl border p-5">
          <div className="flex justify-between text-blue-600">
            <div>
              <p className="text-gray-500">
                Products
              </p>
              <h2 className="text-3xl font-bold text-gray-700">
                {stats.total}
              </h2>
            </div>
            <Boxes />
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <div className="flex justify-between text-blue-600">
            <div className="text-gray-600">
              <p>In Stock</p>
              <h2 className="text-3xl font-bold text-green-500">
                {stats.inStock}
              </h2>
            </div>
            <Package />
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <div className="flex justify-between text-blue-600">
            <div className="text-gray-600">
              <p>Low Stock</p>
              <h2 className="text-3xl font-bold text-amber-500">
                {stats.lowStock}
              </h2>
            </div>
            <AlertCircle />
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <div className="flex justify-between text-blue-600">
            <div className="text-gray-600">
              <p>Out Stock</p>
              <h2 className="text-3xl font-bold text-red-600">
                {stats.outStock}
              </h2>
            </div>
            <Activity />
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <div className="flex justify-between text-blue-600">
            <div className="text-gray-600">
              <p>Profit</p>
              <h2 className="text-3xl font-bold text-green-700">
                {stats.totalProfit.toLocaleString()}
              </h2>
            </div>
            <DollarSign />
          </div>
        </div>

      </div>

      <div className="bg-white rounded-2xl border overflow-x-auto">

        <table className="w-full">

          <thead className="bg-slate-100">
            <tr>
              <th className="p-4 text-left text-gray-700">
                Product
              </th>
              <th className="p-4 text-left text-gray-700">
                Description
              </th>
              <th className="p-4 text-left text-gray-700">
                Cost
              </th>
              <th className="p-4 text-left text-gray-700">
                Selling
              </th>
              <th className="p-4 text-left text-gray-700">
                Qty
              </th>
              <th className="p-4 text-left text-gray-700">
                Supplier
              </th>
              <th className="p-4 text-left text-gray-700">
                Status
              </th>
              <th className="p-4 text-left text-gray-700">
                Unit Profit
              </th>
              <th className="p-4 text-left text-gray-700">
                Total Profit
              </th>
              <th className="p-4 text-left text-gray-700">
                Actions
              </th>
            </tr>
          </thead>

         <tbody>
  {filteredProducts.map((p) => {
    const supplier = supplierMap[p.supplier_id];

    return (
      <tr
        key={p.id}
        className="border-t hover:bg-slate-50 transition"
      >
        <td className="p-4">
          <div>
            <p className="font-semibold text-slate-900">
              {p.name}
            </p>
            <p className="text-xs text-slate-400">
              {p.id?.slice(0, 8)}
            </p>
          </div>
        </td>

        <td className="p-4 text-slate-600">
          {p.description || "—"}
        </td>

        <td className="p-4 font-medium">
          {Number(
            p.cost_price || 0
          ).toLocaleString()}
        </td>

        <td className="p-4 font-semibold text-green-600">
          {Number(
            p.selling_price || 0
          ).toLocaleString()}
        </td>

        <td className="p-4">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              p.quantity === 0
                ? "bg-red-100 text-red-700"
                : p.quantity <= 10
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {p.quantity}
          </span>
        </td>

        <td className="p-4">
          {supplier ? (
            <div>
              <p className="font-medium">
                {supplier.name}
              </p>
              <p className="text-xs text-slate-400">
                {supplier.phone ||
                  "No Phone"}
              </p>
            </div>
          ) : (
            <span className="text-slate-400">
              No Supplier
            </span>
          )}
        </td>

        <td className="p-4">
          {p.profit_status ===
          "profit" ? (
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
              Profit
            </span>
          ) : (
            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold">
              Loss
            </span>
          )}
        </td>

        <td className="p-4">
          {p.profit_status ===
          "profit" ? (
            <span className="font-semibold text-green-600">
              +
              {Number(
                p.profit_money || 0
              ).toLocaleString()}
            </span>
          ) : (
            <span className="font-semibold text-red-600">
              {Number(
                p.profit_money || 0
              ).toLocaleString()}
            </span>
          )}
        </td>

        <td className="p-4">
        {(() => {
          const totalProfit =
            Number(p.profit_money || 0) * Number(p.quantity || 0);

          return p.profit_status === "profit" ? (
            <span className="font-semibold text-green-600">
              {totalProfit.toLocaleString()}
            </span>
          ) : (
            <span className="font-semibold text-red-600">
              {totalProfit.toLocaleString()}
            </span>
          );
        })()}
      </td>

        {/* <td className="p-4 text-slate-500">
          {timeAgo(p.created_at)}
        </td> */}

        <td className="p-4">
          <div className="flex items-center gap-2">

            {/* <button
              onClick={() =>
                openEdit(p)
              }
              className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <Pencil size={16} />
              Edit
            </button> */}

            <button
              onClick={() =>
                deleteProduct(
                  p.id
                )
              }
              disabled={
                deletingId === p.id
              }
              className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <Trash2 size={16} />

              {deletingId === p.id
                ? "Deleting..."
                : "Delete"}
            </button>

          </div>
        </td>
      </tr>
    );
  })}
</tbody>

        </table>

        {filteredProducts.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            <AlertCircle className="mx-auto mb-2" />
            No products found
          </div>
        )}

      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">

          <div className="bg-white rounded-3xl w-full max-w-2xl p-6">

            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-xl">
                Add Product
              </h2>

              <button
                onClick={() =>
                  setShowCreateModal(false)
                }
              >
                <X />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">

              <input
                className="border rounded-xl p-3"
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
              />

              <input
                className="border rounded-xl p-3"
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description:
                      e.target.value,
                  })
                }
              />

              <input
                type="number"
                className="border rounded-xl p-3"
                placeholder="Cost Price"
                value={form.cost_price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cost_price:
                      e.target.value,
                  })
                }
              />

              <input
                type="number"
                className="border rounded-xl p-3"
                placeholder="Selling Price"
                value={form.selling_price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    selling_price:
                      e.target.value,
                  })
                }
              />

              <input
                type="number"
                className="border rounded-xl p-3"
                placeholder="Quantity"
                value={form.quantity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity:
                      e.target.value,
                  })
                }
              />

              <select
                className="border rounded-xl p-3"
                value={form.supplier_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplier_id:
                      e.target.value,
                  })
                }
              >
                <option value="">
                  Select Supplier
                </option>

                {suppliers.map(
                  (supplier: any) => (
                    <option
                      key={supplier.id}
                      value={supplier.id}
                    >
                      {supplier.name}
                    </option>
                  )
                )}
              </select>

            </div>

            <div className="flex justify-end gap-3 mt-6">

              <button
                className="border px-4 py-2 rounded-xl"
                onClick={() =>
                  setShowCreateModal(false)
                }
              >
                Cancel
              </button>

              <button
                onClick={
                  createProduct
                }
                disabled={
                  creating
                }
                className="bg-blue-600 text-white px-5 py-2 rounded-xl"
              >
                {creating
                  ? "Creating..."
                  : "Create Product"}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

