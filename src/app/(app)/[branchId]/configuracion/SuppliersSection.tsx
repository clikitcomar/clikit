"use client";

import { useCallback, useEffect, useState } from "react";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
}

export default function SuppliersSection({ branchId }: { branchId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [saving, setSaving] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/proveedores", { headers: { "x-branch-id": branchId } });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void fetchSuppliers();
  }, [fetchSuppliers]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", note: "" });
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", note: s.note ?? "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const method = editing ? "PATCH" : "POST";
      const body = editing ? { id: editing.id, ...form } : form;
      const res = await fetch("/api/proveedores", {
        method,
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditing(null);
        setForm({ name: "", phone: "", email: "", note: "" });
        await fetchSuppliers();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este proveedor?")) return;
    await fetch("/api/proveedores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({ id }),
    });
    await fetchSuppliers();
  };

  return (
    <section style={{ marginBottom: 0 }}>
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          🚚 Proveedores
        </h2>
        <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)" }} onClick={openNew}>
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "16px", color: "var(--text-3)" }}>Cargando...</div>
      ) : suppliers.length === 0 && !editing ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-3)", fontSize: "13px" }}>
          No hay proveedores registrados. Agregá uno para vincularlo a los ingresos de mercadería.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {suppliers.map((s) => (
            <div key={s.id} className="card" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{s.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-3)", display: "flex", gap: "12px", marginTop: "2px" }}>
                  {s.phone && <span>📞 {s.phone}</span>}
                  {s.email && <span>✉️ {s.email}</span>}
                  {s.note && <span>📝 {s.note}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: "12px" }} onClick={() => openEdit(s)}>
                  Editar
                </button>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: "12px", color: "var(--red)" }} onClick={() => handleDelete(s.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing !== null || (!loading && (form.name || suppliers.length > 0))) && (
        <div className="card" style={{ padding: "14px", marginTop: "10px", display: "grid", gap: "10px" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-2)" }}>
            {editing ? "Editar proveedor" : "Nuevo proveedor"}
          </div>
          <input className="input" placeholder="Nombre *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <input className="input" placeholder="Teléfono" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <input className="input" placeholder="Nota (opcional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditing(null); setForm({ name: "", phone: "", email: "", note: "" }); }}>
              Cancelar
            </button>
            <button className="btn btn-green" style={{ flex: 2 }} onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
