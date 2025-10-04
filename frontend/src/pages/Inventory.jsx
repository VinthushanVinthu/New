import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import "../styles/Inventory.css"; 

export default function Inventory() {
  const [shopId, setShopId] = useState('');
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false); 
  const [form, setForm] = useState({ name: '', type: '', color: '', design: '', price: '', stock_quantity: '' });

  async function load() {
    const shops = await api.get('/shop/my');
    const sid = shops.data[0]?.shop_id;
    if (sid) {
      setShopId(sid);
      const { data } = await api.get('/inventory/sarees', { params: { shop_id: sid } });
      setItems(data);
    }
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    await api.post('/inventory/sarees', {
      ...form,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
      shop_id: shopId
    });
    setForm({ name: '', type: '', color: '', design: '', price: '', stock_quantity: '' });
    setShowForm(false);
    load();
  }

  return (
    <>
      {/* Inventory Table */}
      <div className="card">
        <h3>Inventory</h3>
        <button className="button" onClick={() => setShowForm(true)}>+ Add Saree</button>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Color</th><th>Price</th><th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.type}</td>
                <td>{i.color}</td>
                <td>{i.price}</td>
                <td>{i.stock_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Add Form */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ marginBottom: "15px" }}>➕ Add New Saree</h3>
            <form onSubmit={add} className="form">
              <label>
                Saree Name
                <input className="input" placeholder="Enter saree name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Type
                <input className="input" placeholder="Cotton, Silk, etc." value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required />
              </label>
              <label>
                Color
                <input className="input" placeholder="Red, Blue, etc." value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} required />
              </label>
              <label>
                Design
                <input className="input" placeholder="Printed, Embroidery, etc." value={form.design} onChange={e => setForm({ ...form, design: e.target.value })} />
              </label>
              <label>
                Price (₹)
                <input className="input" placeholder="Enter price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
              </label>
              <label>
                Quantity
                <input className="input" placeholder="Enter quantity" type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} required />
              </label>
              
              <div className="form-buttons">
                <button className="button" type="submit">✅ Save</button>
                <button type="button" className="button cancel" onClick={() => setShowForm(false)}>❌ Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
