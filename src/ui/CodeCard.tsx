import { CopyCode } from './CopyButton';
import type { RecordView } from './record-view';
import './code-card.css';

/**
 * A saved code in the popup: a small ticket with the code and Copy on its stub.
 * The site is shown in every tab, so a card is never blank and a code saved for a
 * subdomain says so.
 */
export function CodeCard({ row }: { row: RecordView }) {
  return (
    <li className={`code-card code-card--${row.status}`}>
      <div className="code-card__details">
        <p className="code-card__site">
          {row.merchant === undefined ? (
            <span className="muted">No site</span>
          ) : (
            <>
              {row.merchant.name}
              {row.merchant.stored !== undefined && (
                <span className="muted"> ({row.merchant.stored})</span>
              )}
            </>
          )}
        </p>
        {row.status !== 'active' && (
          <p className={`status status--${row.status}`}>{row.statusLabel}</p>
        )}
        {row.dates !== undefined && <p className="muted">{row.dates}</p>}
        {row.note !== undefined && <p className="code-card__note">{row.note}</p>}
      </div>
      <div className="code-card__stub">
        <CopyCode code={row.code} />
      </div>
    </li>
  );
}
