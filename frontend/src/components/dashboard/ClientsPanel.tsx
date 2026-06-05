import { useMemo, useState } from "react";

import { WifiClient } from "../../api/websocket";
import { cardStyle } from "../../theme/dashboard";

type Radio = "2G" | "5G" | "6G";

type Props = {
  clientsByRadio: Record<Radio, WifiClient[]>;
};

const RADIOS: Radio[] = ["2G", "5G", "6G"];

export default function ClientsPanel({ clientsByRadio }: Props) {
  const [activeRadio, setActiveRadio] = useState<Radio>("2G");

  const rows = useMemo(() => clientsByRadio[activeRadio] ?? [], [activeRadio, clientsByRadio]);

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>WiFi Clients Panel</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {RADIOS.map((radio) => (
          <button key={radio} onClick={() => setActiveRadio(radio)} disabled={activeRadio === radio}>
            {radio}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>MAC</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>IP</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>RSSI</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>SNR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((client, idx) => (
              <tr key={`${client.mac ?? "na"}-${idx}`}>
                <td style={{ padding: "4px 0" }}>{String(client.mac ?? "-")}</td>
                <td style={{ padding: "4px 0" }}>{String(client.ip ?? "-")}</td>
                <td style={{ padding: "4px 0" }}>{String(client.rssi ?? "-")}</td>
                <td style={{ padding: "4px 0" }}>{String(client.snr ?? "-")}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "6px 0", color: "#666" }}>
                  No clients for {activeRadio}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
