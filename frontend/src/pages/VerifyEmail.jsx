import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { authService } from '../services/authService';
import { apiErrorMessage } from '../utils/format';
import './ForgotPassword.css';

/**
 * Pagina a la que lleva el enlace del mail de verificacion
 * (/verify-email?token=...). Confirma el email apenas se abre y, si el
 * enlace ya no sirve, permite pedir uno nuevo.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, isAuthenticated, updateUser } = useContext(AuthContext);

  const [status, setStatus] = useState(token ? 'loading' : 'error');
  const [errorText, setErrorText] = useState(token ? '' : 'El enlace no es válido.');
  const [email, setEmail] = useState(user?.email || '');
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);
  // El token se borra al usarse: hay que mandarlo una sola vez, aunque
  // React monte el componente dos veces en desarrollo.
  const sentRef = useRef(false);

  useEffect(() => {
    if (!token || sentRef.current) return;
    sentRef.current = true;
    authService.verifyEmail(token)
      .then(() => {
        setStatus('success');
        if (user) updateUser({ ...user, email_verified: true });
      })
      .catch((err) => {
        setStatus('error');
        setErrorText(apiErrorMessage(err, 'No se pudo verificar el email.'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setResending(true);
    setResendMsg('');
    try {
      const { data } = await authService.resendVerification(email.trim().toLowerCase());
      setResendMsg(data.message);
    } catch (err) {
      setResendMsg(apiErrorMessage(err, 'No se pudo reenviar el enlace.'));
    } finally {
      setResending(false);
    }
  };

  const continueTo = isAuthenticated ? '/dashboard' : '/login';
  const continueLabel = isAuthenticated ? 'Ir al panel' : 'Iniciar sesión';

  return (
    <div className="forgot-page">
      <div className="forgot-card">
        {status === 'loading' && (
          <div className="forgot-header">
            <h1>Verificando email...</h1>
            <p className="forgot-subtitle">Un momento, por favor.</p>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="forgot-header">
              <h1>¡Email verificado!</h1>
              <p className="forgot-subtitle">Tu cuenta quedó confirmada.</p>
            </div>
            <div className="forgot-sent">
              <Link to={continueTo} className="btn btn-primary forgot-link">
                {continueLabel}
              </Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="forgot-header">
              <h1>Enlace inválido</h1>
              <p className="forgot-subtitle">
                {errorText} Puede que ya lo hayas usado (en ese caso tu email ya está
                verificado) o que se haya enviado uno más nuevo.
              </p>
            </div>
            <form onSubmit={handleResend} className="verify-resend">
              <div className="form-group">
                <label className="form-label" htmlFor="verify-email-input">
                  Pedir un enlace nuevo
                </label>
                <input
                  id="verify-email-input"
                  type="email"
                  className="input"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setResendMsg(''); }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary forgot-btn"
                disabled={resending || !email.trim()}
              >
                {resending ? 'Enviando...' : 'Reenviar enlace'}
              </button>
              {resendMsg && <p className="verify-msg" role="status">{resendMsg}</p>}
            </form>
            <div className="forgot-footer">
              <Link to={continueTo}>{continueLabel}</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
