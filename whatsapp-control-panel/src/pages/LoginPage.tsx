import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { login } from '../api/auth';
import { currentAdminQueryKey } from '../api/queries';
import { ApiClientError } from '../api/client';
import { navigate, safeReturnPath } from '../routing/navigation';

type LoginPageProps = {
  sessionExpired?: boolean;
};

export const LoginPage = ({ sessionExpired = false }: LoginPageProps) => {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      queryClient.setQueryData(currentAdminQueryKey, session);
      navigate(safeReturnPath(window.location.search), true);
    }
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ username, password });
  };

  const requestId =
    mutation.error instanceof ApiClientError ? mutation.error.requestId : undefined;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand brand--login">
          <span className="brand__mark" aria-hidden="true">W</span>
          <span>
            <strong>Control Room</strong>
            <small>WhatsApp Operations</small>
          </span>
        </div>
        <p className="eyebrow">Secure admin access</p>
        <h1 id="login-title">Masuk ke control panel</h1>
        <p className="login-card__intro">
          Gunakan akun admin backend. Credential dan session tidak disimpan di
          local storage browser.
        </p>

        {sessionExpired && (
          <div className="form-alert" role="status">
            Session berakhir. Silakan masuk kembali.
          </div>
        )}
        {mutation.isError && (
          <div className="form-alert form-alert--error" role="alert">
            {mutation.error.message}
            {requestId && <small>Request ID: {requestId}</small>}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              maxLength={100}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              maxLength={256}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button
            className="button button--primary login-form__submit"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? 'Memverifikasi…' : 'Masuk'}
          </button>
        </form>

      </section>
    </main>
  );
};
