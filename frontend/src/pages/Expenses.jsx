import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { expenseService } from '../services/expenseService';
import Loading from '../components/Loading';
import DownloadButton from '../components/DownloadButton';
import { apiErrorMessage, formatMoney, parseEventDate } from '../utils/format';
import './Expenses.css';

const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const EMPTY_FORM = {
  concept: '',
  category: 'other',
  amount: '',
  paid_by: '',
  expense_date: today(),
  notes: '',
};

function BudgetBar({ summary }) {
  if (summary.budget === null) {
    return (
      <div className="budget-card">
        <div className="budget-figures">
          <div>
            <span className="budget-label">Total gastado</span>
            <span className="budget-value">{formatMoney(summary.total)}</span>
          </div>
        </div>
        <p className="budget-hint">
          Este evento no tiene presupuesto. Podés cargarlo desde “Editar” en el detalle del evento.
        </p>
      </div>
    );
  }

  const used = Math.min(summary.percentage_used ?? 0, 100);
  const level = summary.over_budget ? 'over' : used >= 80 ? 'warning' : 'ok';

  return (
    <div className={`budget-card budget-${level}`}>
      <div className="budget-figures">
        <div>
          <span className="budget-label">Gastado</span>
          <span className="budget-value">{formatMoney(summary.total)}</span>
        </div>
        <div>
          <span className="budget-label">Presupuesto</span>
          <span className="budget-value">{formatMoney(summary.budget)}</span>
        </div>
        <div>
          <span className="budget-label">{summary.over_budget ? 'Excedido' : 'Disponible'}</span>
          <span className="budget-value budget-remaining">
            {formatMoney(Math.abs(Number(summary.remaining)))}
          </span>
        </div>
      </div>
      <div
        className="budget-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used)}
        aria-label="Porcentaje del presupuesto usado"
      >
        <div className="budget-bar-fill" style={{ width: `${used}%` }} />
      </div>
      <p className="budget-hint">
        {summary.over_budget
          ? `Se superó el presupuesto (${summary.percentage_used}% usado).`
          : `${summary.percentage_used ?? 0}% del presupuesto usado.`}
      </p>
    </div>
  );
}

export default function Expenses() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setError('');
    try {
      const [list, sum] = await Promise.all([
        expenseService.list({ event: id, page_size: 200 }),
        expenseService.summary(id),
      ]);
      setExpenses(list.data.results || list.data);
      setSummary(sum.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Error al cargar los gastos.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadData();
      try {
        const { data } = await expenseService.categories();
        if (!cancelled) setCategories(data);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, expense_date: today() });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setForm({
      concept: expense.concept,
      category: expense.category,
      amount: expense.amount,
      paid_by: expense.paid_by || '',
      expense_date: expense.expense_date,
      notes: expense.notes || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.concept.trim()) errs.concept = 'El concepto es obligatorio.';
    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      errs.amount = 'Ingresá un monto mayor a cero.';
    }
    if (!form.expense_date) errs.expense_date = 'La fecha es obligatoria.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, concept: form.concept.trim(), event: Number(id) };
      if (editing) {
        await expenseService.update(editing.id, payload);
      } else {
        await expenseService.create(payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object' && !Array.isArray(data) && !data.detail) {
        const fieldErrors = {};
        for (const [key, msgs] of Object.entries(data)) {
          fieldErrors[key] = Array.isArray(msgs) ? msgs[0] : msgs;
        }
        setFormErrors(fieldErrors);
      } else {
        setFormErrors({ general: apiErrorMessage(err, 'No se pudo guardar el gasto.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`¿Eliminar el gasto "${expense.concept}" de ${formatMoney(expense.amount)}?`)) return;
    try {
      await expenseService.destroy(expense.id);
      await loadData();
    } catch (err) {
      alert(apiErrorMessage(err, 'No se pudo eliminar el gasto.'));
    }
  };

  if (loading) return <Loading text="Cargando gastos..." />;

  return (
    <div className="expenses-page">
      <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}`)}>
        ← Volver al evento
      </button>

      <div className="expenses-header">
        <div>
          <h1>Gastos</h1>
          <p className="expenses-subtitle">
            {summary?.event_title} · {summary?.count ?? 0} {summary?.count === 1 ? 'gasto' : 'gastos'}
          </p>
        </div>
        <div className="expenses-header-actions">
          <DownloadButton
            url="/expenses/export/"
            params={{ event: id }}
            fallbackName="gastos.xlsx"
          />
          <button className="btn btn-primary" onClick={openCreate}>
            + Agregar gasto
          </button>
        </div>
      </div>

      {error && <div className="expenses-error">{error}</div>}

      {summary && <BudgetBar summary={summary} />}

      {summary && summary.by_category.length > 0 && (
        <div className="expenses-categories">
          {summary.by_category.map((row) => (
            <div key={row.category} className="category-chip">
              <span className="category-chip-label">{row.label}</span>
              <span className="category-chip-value">{formatMoney(row.total)}</span>
            </div>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="expenses-empty">
          <p>Todavía no hay gastos cargados para este evento.</p>
          <button className="btn btn-primary" onClick={openCreate}>
            Cargar el primer gasto
          </button>
        </div>
      ) : (
        <div className="expenses-table-wrapper">
          <table className="expenses-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Pagado por</th>
                <th className="col-amount">Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{parseEventDate(expense.expense_date).toLocaleDateString('es-AR')}</td>
                  <td>
                    <div className="expense-concept">{expense.concept}</div>
                    {expense.notes && <div className="expense-notes">{expense.notes}</div>}
                  </td>
                  <td>{expense.category_label}</td>
                  <td>{expense.paid_by || '—'}</td>
                  <td className="col-amount">{formatMoney(expense.amount)}</td>
                  <td>
                    <div className="expense-actions">
                      <button className="btn-icon" onClick={() => openEdit(expense)} title="Editar">
                        ✏️
                      </button>
                      <button className="btn-icon" onClick={() => handleDelete(expense)} title="Eliminar">
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td className="col-amount">{formatMoney(summary?.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Editar gasto' : 'Agregar gasto'}</h2>
            <form onSubmit={handleSubmit} noValidate>
              {formErrors.general && <div className="form-error">{formErrors.general}</div>}

              <div className="form-group">
                <label htmlFor="concept">Concepto</label>
                <input
                  id="concept"
                  name="concept"
                  type="text"
                  placeholder="Ej. Catering para 150 personas"
                  value={form.concept}
                  onChange={handleChange}
                />
                {formErrors.concept && <span className="error-text">{formErrors.concept}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="amount">Monto ($)</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={handleChange}
                  />
                  {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="category">Categoría</label>
                  <select id="category" name="category" value={form.category} onChange={handleChange}>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="paid_by">Pagado por (opcional)</label>
                  <input
                    id="paid_by"
                    name="paid_by"
                    type="text"
                    placeholder="Nombre"
                    value={form.paid_by}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="expense_date">Fecha</label>
                  <input
                    id="expense_date"
                    name="expense_date"
                    type="date"
                    value={form.expense_date}
                    onChange={handleChange}
                  />
                  {formErrors.expense_date && <span className="error-text">{formErrors.expense_date}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notas (opcional)</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={form.notes}
                  onChange={handleChange}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
