import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EVENT_CATEGORIES } from '../constants/categories';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import './EventForm.css';

export default function EventForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    event_time: '',
    location: '',
    category: 'other',
    budget: '',
    image: null,
  });
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    const fetchEvent = async () => {
      try {
        const { data } = await eventService.retrieve(id);
        if (cancelled) return;
        setForm({
          title: data.title || '',
          description: data.description || '',
          event_date: data.event_date || '',
          event_time: data.event_time || '',
          location: data.location || '',
          category: data.category || 'other',
          budget: data.budget ?? '',
          image: null,
        });
      } catch {
        if (!cancelled) setError('Error al cargar el evento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEvent();
    return () => { cancelled = true; };
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleFileChange = (e) => {
    setForm((prev) => ({ ...prev, image: e.target.files[0] }));
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'El título es obligatorio.';
    if (!form.event_date) errs.event_date = 'La fecha es obligatoria.';
    if (form.budget !== '' && Number(form.budget) < 0) errs.budget = 'El presupuesto no puede ser negativo.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = new FormData();
      payload.append('title', form.title.trim());
      if (form.description) payload.append('description', form.description);
      payload.append('event_date', form.event_date);
      if (form.event_time) payload.append('event_time', form.event_time);
      if (form.location) payload.append('location', form.location);
      payload.append('category', form.category);
      // Vacio = sin presupuesto (al editar, borra el que tenia)
      if (form.budget !== '' || isEditing) payload.append('budget', form.budget);
      if (form.image) payload.append('image', form.image);

      if (isEditing) {
        await eventService.update(id, payload);
      } else {
        await eventService.create(payload);
      }
      navigate('/events');
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const fieldErrors = {};
        let hasField = false;
        for (const [key, msgs] of Object.entries(data)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            fieldErrors[key] = Array.isArray(msgs) ? msgs[0] : msgs;
            hasField = true;
          }
        }
        if (hasField) {
          setErrors(fieldErrors);
          return;
        }
      }
      setError(data?.detail || `Error al ${isEditing ? 'actualizar' : 'crear'} el evento.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading text="Cargando evento..." />;

  return (
    <div className="event-form-page">
      <button className="btn btn-secondary" onClick={() => navigate('/events')}>
        ← Volver
      </button>

      <div className="event-form-card">
        <h1>{isEditing ? 'Editar Evento' : 'Nuevo Evento'}</h1>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="title">Título</label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Nombre del evento"
              value={form.title}
              onChange={handleChange}
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <p className="error-text">{errors.title}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              name="description"
              placeholder="Descripción del evento"
              rows={4}
              value={form.description}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="event_date">Fecha del evento</label>
              <input
                id="event_date"
                name="event_date"
                type="date"
                value={form.event_date}
                onChange={handleChange}
                className={errors.event_date ? 'input-error' : ''}
              />
              {errors.event_date && <p className="error-text">{errors.event_date}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="event_time">Hora</label>
              <input
                id="event_time"
                name="event_time"
                type="time"
                value={form.event_time}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category">Categoría</label>
              <select
                id="category"
                name="category"
                value={form.category}
                onChange={handleChange}
              >
                {EVENT_CATEGORIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="location">Ubicación</label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="Lugar del evento"
                value={form.location}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="budget">Presupuesto en $ (opcional)</label>
            <input
              id="budget"
              name="budget"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ej. 12000"
              value={form.budget}
              onChange={handleChange}
            />
            {errors.budget && <span className="error-text">{errors.budget}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="image">Imagen (opcional)</label>
            <input
              id="image"
              name="image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/events')}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
