import React from 'react';
import { Link } from 'react-router-dom';

export default function CashierDashboard(){
  return (
    <>
      <div className="kpi">
        <div className="card"><h3>Today Total</h3><h2>₹ 0</h2></div>
        <div className="card"><h3>Bills</h3><h2>0</h2></div>
        <div className="card"><h3>Customers Served</h3><h2>0</h2></div>
      </div>
      <div className="card">
        <h3>Quick Actions</h3>
        <div className="flex">
          <Link className="button" to="/billing">New Bill</Link>
          <Link className="button" to="/inventory">Check Stock</Link>
        </div>
      </div>
    </>
  )
}
