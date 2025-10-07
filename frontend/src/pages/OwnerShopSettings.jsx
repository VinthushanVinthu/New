// src/pages/OwnerShopSettings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/owner-settings.css";

export default function OwnerShopSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [shop, setShop] = useState(null);

  const [form, setForm] = useState({
    shop_name: "",
    address_line: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    tax_percentage: 0,
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .get("/shop/owner/current")
      .then((r) => {
        if (!mounted) return;
        setShop(r.data || null);
        if (r.data) {
          setForm({
            shop_name: r.data.shop_name || "",
            address_line: r.data.address_line || "",
            city: r.data.city || "",
            state: r.data.state || "",
            postal_code: r.data.postal_code || "",
            country: r.data.country || "",
            tax_percentage: r.data.tax_percentage ?? 0,
          });
        }
      })
      .catch((e) => setError(e?.response?.data?.message || "Failed to load"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]: name === "tax_percentage" ? Number(value) : value,
    }));
  };

  const canSave = useMemo(() => !!form.shop_name, [form.shop_name]);

  const onSave = async () => {
    if (!shop) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/shop/${shop.shop_id}`, {
        ...form,
      });
      // refetch to show latest
      const r = await api.get("/shop/owner/current");
      setShop(r.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-wrap"><div className="card">Loading...</div></div>;
  }

  if (!shop) {
    return (
      <div className="page-wrap">
        <div className="card">
          <h2>Shop Settings</h2>
          <p>No shop found. Please create one first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card">
        <div className="header">
          <div>
            <h2>Shop Settings</h2>
            <p className="muted">Edit your shop details and tax configuration.</p>
          </div>
          <div className="meta">
            <div><span className="k">Shop ID</span><span className="v">{shop.shop_id}</span></div>
            <div><span className="k">Secret Code</span><span className="v mono">{shop.secret_code}</span></div>
            <div><span className="k">Created</span><span className="v">{new Date(shop.created_at).toLocaleString()}</span></div>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="form-grid">
          <div className="form-item">
            <label>Shop Name *</label>
            <input
              type="text"
              name="shop_name"
              value={form.shop_name}
              onChange={onChange}
              placeholder="Eg. Lakshmi Sarees"
            />
          </div>

          <div className="form-item">
            <label>Address Line</label>
            <input
              type="text"
              name="address_line"
              value={form.address_line}
              onChange={onChange}
              placeholder="Street / No."
            />
          </div>

          <div className="form-item">
            <label>City</label>
            <input
              type="text"
              name="city"
              value={form.city}
              onChange={onChange}
              placeholder="City"
            />
          </div>

          <div className="form-item">
            <label>State</label>
            <input
              type="text"
              name="state"
              value={form.state}
              onChange={onChange}
              placeholder="State / Province"
            />
          </div>

          <div className="form-item">
            <label>Postal Code</label>
            <input
              type="text"
              name="postal_code"
              value={form.postal_code}
              onChange={onChange}
              placeholder="Postal / Zip"
            />
          </div>

          <div className="form-item">
            <label>Country</label>
            <input
              type="text"
              name="country"
              value={form.country}
              onChange={onChange}
              placeholder="Country"
            />
          </div>

          <div className="form-item">
            <label>Tax %</label>
            <input
              type="number"
              name="tax_percentage"
              value={form.tax_percentage}
              onChange={onChange}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="actions">
          <button
            className="btn primary"
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
