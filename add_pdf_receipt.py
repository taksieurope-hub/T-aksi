path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add PDF generation function
old = "const RiderPortal = () => {"
new = '''const generatePDFReceipt = (ride) => {
  const fare = ride.final_fare || ride.estimated_fare || 0;
  const tip = ride.tip_amount || 0;
  const total = fare + tip;
  const surge = ride.surge_multiplier || 1.0;
  const distance = ride.actual_distance || ride.estimated_distance || 0;
  const carType = (ride.carType || "economy").charAt(0).toUpperCase() + (ride.carType || "economy").slice(1);
  const payment = (ride.payment_method || "cash").charAt(0).toUpperCase() + (ride.payment_method || "cash").slice(1);
  const driverName = ride.driver_info?.name || "Your driver";
  const date = ride.completed_at ? new Date(ride.completed_at).toLocaleString() : new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>T'aksi Receipt</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 480px; margin: 40px auto; color: #111; }
    .header { background: linear-gradient(135deg, #00ff88, #00d4ff); padding: 24px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: #000; }
    .header p { margin: 4px 0 0; color: #000; opacity: 0.6; font-size: 13px; }
    .body { border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #888; }
    .value { font-weight: 500; }
    .total-row { display: flex; justify-content: space-between; padding: 12px 0; font-size: 16px; font-weight: bold; border-top: 2px solid #000; margin-top: 8px; }
    .total-value { color: #00aa55; }
    .footer { text-align: center; margin-top: 24px; color: #aaa; font-size: 11px; }
    .section-title { font-size: 11px; text-transform: uppercase; color: #aaa; letter-spacing: 1px; margin: 16px 0 8px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>T'aksi</h1>
    <p>Ride Receipt</p>
  </div>
  <div class="body">
    <p style="color:#555;font-size:13px;margin:0 0 16px;">${date}</p>
    <div class="section-title">Journey</div>
    <div class="row"><span class="label">From</span><span class="value">${ride.pickup || ""}</span></div>
    <div class="row"><span class="label">To</span><span class="value">${ride.destination || ""}</span></div>
    <div class="row"><span class="label">Distance</span><span class="value">${distance.toFixed(1)} km</span></div>
    <div class="section-title">Driver</div>
    <div class="row"><span class="label">Name</span><span class="value">${driverName}</span></div>
    <div class="row"><span class="label">Vehicle class</span><span class="value">${carType}</span></div>
    <div class="section-title">Payment</div>
    <div class="row"><span class="label">Fare</span><span class="value">GEL ${fare.toFixed(2)}</span></div>
    ${tip > 0 ? `<div class="row"><span class="label">Tip</span><span class="value">GEL ${tip.toFixed(2)}</span></div>` : ""}
    ${surge > 1 ? `<div class="row"><span class="label">Surge</span><span class="value">${surge}x</span></div>` : ""}
    <div class="row"><span class="label">Method</span><span class="value">${payment}</span></div>
    <div class="total-row"><span>Total</span><span class="total-value">GEL ${total.toFixed(2)}</span></div>
    <div class="footer">
      Ride ID: ${ride.id || ""}<br>
      T'aksi — taksigeorgia@gmail.com<br>
      Thank you for riding with us!
    </div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
};

const RiderPortal = () => {'''

if old in c:
    c = c.replace(old, new)
    print("OK: PDF receipt function added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
