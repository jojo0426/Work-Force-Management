'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiJson, loadSession, Session } from '../../lib/api';

type User = {
  id:string;
  name:string;
  email:string;
  phone?:string|null;
  role:string;
  teamId?:string|null;
  status:string;
  isActive:boolean;
  createdAt:string;
};

type Team = {
  id:string;
  name:string;
  activeTechnicians?:number;
  technicians?:{id:string;name?:string;status?:string}[];
};

const ROLES = [
  'TECHNICIAN',
  'JOB_CONTROLLER',
  'SUPERVISOR',
  'ADMINISTRATOR'
];

const EMPTY_USER = {
  name:'',
  email:'',
  password:'',
  role:'TECHNICIAN',
  phone:'',
  teamId:''
};

export default function UsersTeams() {
  const [session,setSession] = useState<Session|null>(null);
  const [users,setUsers] = useState<User[]>([]);
  const [teams,setTeams] = useState<Team[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [q,setQ] = useState('');

  const [form,setForm] = useState(EMPTY_USER);
  const [teamName,setTeamName] = useState('');

  const [editing,setEditing] = useState<User|null>(null);
  const [editForm,setEditForm] = useState({
    name:'',
    email:'',
    role:'TECHNICIAN',
    phone:'',
    teamId:''
  });

  const [passwordUser,setPasswordUser] = useState<User|null>(null);
  const [newPassword,setNewPassword] = useState('');

  const [editingTeam,setEditingTeam] = useState<Team|null>(null);
  const [editTeamName,setEditTeamName] = useState('');

  const [deleteTarget,setDeleteTarget] = useState<{
    type:'team';
    id:string;
    label:string;
    detail?:string;
  }|null>(null);
  const [deleteError,setDeleteError] = useState('');

  useEffect(() => setSession(loadSession()), []);

  async function load() {
    if (!session) return;

    setLoading(true);
    setError('');

    try {
      const [u,t] = await Promise.all([
        apiJson('/users',{},session),
        apiJson('/teams',{},session)
      ]);

      setUsers(u.users || []);
      setTeams(t.teams || []);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  function success(message:string) {
    setNotice(message);
    setError('');
  }

  function requestTeamDelete(team:Team) {
    if (busy !== '') return;

    setDeleteError('');
    setDeleteTarget({
      type:'team',
      id:team.id,
      label:team.name
    });
  }

  function cancelDelete() {
    if (busy === 'delete') return;

    setDeleteError('');
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!session || !deleteTarget || busy !== '') return;

    const target = deleteTarget;

    setBusy('delete');
    setDeleteError('');
    setError('');
    setNotice('');

    try {
      const endpoint = `/teams/${target.id}`;

      await apiJson(
        endpoint,
        { method:'DELETE' },
        session
      );

      setDeleteTarget(null);

      success(`Team ${target.label} deleted.`);

      await load();
    } catch (e:any) {
      setDeleteError(
        e?.message ||
        'Unable to delete team.'
      );
    } finally {
      setBusy('');
    }
  }

  async function create(e:FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError('');
    setNotice('');

    try {
      await apiJson('/users',{
        method:'POST',
        body:JSON.stringify({
          ...form,
          teamId:form.teamId || undefined,
          phone:form.phone || undefined
        })
      },session);

      setForm(EMPTY_USER);
      success('User account created successfully.');
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function createTeam(e:FormEvent) {
    e.preventDefault();

    const name = teamName.trim();
    if (!name) return;

    setBusy('create-team');
    setError('');
    setNotice('');

    try {
      await apiJson('/teams',{
        method:'POST',
        body:JSON.stringify({name})
      },session);

      setTeamName('');
      success('Team created successfully.');
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function openEdit(u:User) {
    setEditing(u);
    setEditForm({
      name:u.name,
      email:u.email,
      role:u.role,
      phone:u.phone || '',
      teamId:u.teamId || ''
    });
    setError('');
    setNotice('');
  }

  async function saveUser(e:FormEvent) {
    e.preventDefault();
    if (!editing) return;

    setBusy(`edit-${editing.id}`);
    setError('');
    setNotice('');

    try {
      await apiJson(`/users/${encodeURIComponent(editing.id)}`,{
        method:'PATCH',
        body:JSON.stringify({
          name:editForm.name,
          email:editForm.email,
          role:editForm.role,
          phone:editForm.phone || null,
          teamId:editForm.teamId || null
        })
      },session);

      setEditing(null);
      success('User information updated successfully.');
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function openPassword(u:User) {
    setPasswordUser(u);
    setNewPassword('');
    setError('');
    setNotice('');
  }

  async function resetPassword(e:FormEvent) {
    e.preventDefault();
    if (!passwordUser) return;

    setBusy(`password-${passwordUser.id}`);
    setError('');
    setNotice('');

    try {
      await apiJson(
        `/users/${encodeURIComponent(passwordUser.id)}/password`,
        {
          method:'PATCH',
          body:JSON.stringify({password:newPassword})
        },
        session
      );

      setPasswordUser(null);
      setNewPassword('');
      success('Password reset successfully.');
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function toggle(u:User) {
    setBusy(`status-${u.id}`);
    setError('');
    setNotice('');

    try {
      await apiJson(
        `/users/${encodeURIComponent(u.id)}/status`,
        {
          method:'PATCH',
          body:JSON.stringify({isActive:!u.isActive})
        },
        session
      );

      success(u.isActive ? 'User account disabled.' : 'User account enabled.');
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function openTeamEdit(team:Team) {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setError('');
    setNotice('');
  }

  async function saveTeam(e:FormEvent) {
    e.preventDefault();
    if (!editingTeam) return;

    const name = editTeamName.trim();
    if (!name) return;

    setBusy(`team-${editingTeam.id}`);
    setError('');
    setNotice('');

    try {
      await apiJson(`/teams/${encodeURIComponent(editingTeam.id)}`,{
        method:'PATCH',
        body:JSON.stringify({name})
      },session);

      setEditingTeam(null);
      setEditTeamName('');
      success('Team name updated successfully.');
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const filtered = useMemo(
    () => users.filter(
      u => !q ||
        `${u.name} ${u.email} ${u.role} ${u.status}`
          .toLowerCase()
          .includes(q.toLowerCase())
    ),
    [users,q]
  );

  if (!session) {
    return (
      <div className="wfm-page">
        <div className="wfm-panel">
          <h2>Users & Teams</h2>
          <p>Sign in through Command Center first.</p>
        </div>
      </div>
    );
  }

  if (session.user.role !== 'ADMINISTRATOR') {
    return (
      <div className="wfm-page">
        <div className="wfm-panel">
          <span className="wfm-eyebrow">ADMINISTRATION</span>
          <h2>Users & Teams</h2>
          <div className="wfm-alert">
            Administrator access is required to manage user accounts.
          </div>
        </div>
      </div>
    );
  }

  const active = users.filter(x => x.isActive).length;
  const techs = users.filter(x => x.role === 'TECHNICIAN').length;
  const online = users.filter(
    x => x.role === 'TECHNICIAN' && x.status !== 'OFFLINE'
  ).length;

  return (
    <div className="wfm-page">

      <div className="wfm-page-head">
        <div>
          <span className="wfm-eyebrow">ACCESS + FIELD ORGANIZATION</span>
          <h1>Users & Teams</h1>
          <p>
            Manage WFM accounts, operational roles, technician availability
            and team membership.
          </p>
        </div>

        <button
          className="wfm-layer-toggle on"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'REFRESHING...' : 'REFRESH'}
        </button>
      </div>

      {error && <div className="wfm-alert">{error}</div>}
      {notice && <div className="wfm-success">{notice}</div>}

      <div className="wfm-kpis">
        <K label="Users" v={users.length}/>
        <K label="Active Accounts" v={active}/>
        <K label="Technicians" v={techs}/>
        <K label="Online Technicians" v={online}/>
        <K label="Field Teams" v={teams.length}/>
      </div>

      <div className="wfm-grid-2">

        <div className="wfm-panel">
          <span className="wfm-eyebrow">ADMINISTRATOR</span>
          <h3>Create WFM User</h3>

          <form
            className="wfm-user-form"
            onSubmit={create}
            autoComplete="off"
          >
            <div className="wfm-user-form-grid">

              <div className="wfm-form-field">
                <label>Name</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(x => ({
                    ...x,
                    name:e.target.value
                  }))}
                  placeholder="Full name"
                  autoComplete="off"
                />
              </div>

              <div className="wfm-form-field">
                <label>Email / Username</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(x => ({
                    ...x,
                    email:e.target.value
                  }))}
                  placeholder="Email address"
                  autoComplete="off"
                />
              </div>

              <div className="wfm-form-field">
                <label>Password</label>
                <input
                  required
                  minLength={12}
                  type="password"
                  value={form.password}
                  onChange={e => setForm(x => ({
                    ...x,
                    password:e.target.value
                  }))}
                  placeholder="Minimum 12 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="wfm-form-field">
                <label>Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(x => ({
                    ...x,
                    role:e.target.value
                  }))}
                >
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>

              <div className="wfm-form-field">
                <label>Assign Team</label>
                <select
                  value={form.teamId}
                  onChange={e => setForm(x => ({
                    ...x,
                    teamId:e.target.value
                  }))}
                >
                  <option value="">No team</option>
                  {teams.map(t =>
                    <option key={t.id} value={t.id}>{t.name}</option>
                  )}
                </select>
              </div>

              <div className="wfm-form-field">
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(x => ({
                    ...x,
                    phone:e.target.value
                  }))}
                  placeholder="Phone number"
                  autoComplete="off"
                />
              </div>

            </div>

            <div className="wfm-user-form-actions">
              <button
                className="wfm-primary-btn wfm-user-submit"
                disabled={busy === 'create'}
              >
                {busy === 'create' ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>

          <div className="wfm-info">
            The email address is the account login username.
            New accounts start OFFLINE and active.
            Passwords require at least 12 characters.
          </div>
        </div>

        <div className="wfm-panel">
          <span className="wfm-eyebrow">FIELD ORGANIZATION</span>
          <h3>Team Management</h3>

          <form
            className="wfm-team-create"
            onSubmit={createTeam}
            autoComplete="off"
          >
            <div className="wfm-form-field">
              <label>New Team Name / Number</label>
              <input
                required
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Example: Team 01"
                autoComplete="off"
              />
            </div>

            <button
              className="wfm-primary-btn"
              disabled={busy === 'create-team' || !teamName.trim()}
            >
              {busy === 'create-team' ? 'Creating...' : 'Create Team'}
            </button>
          </form>

          <div className="wfm-team-list">
            {teams.length ? teams.map((t,i) =>
              <div className="wfm-team-row" key={t.id}>
                <span className="wfm-route-number">{i + 1}</span>

                <div className="wfm-team-copy">
                  <b>{t.name}</b>
                  <small>
                    {t.activeTechnicians ??
                      t.technicians?.filter(
                        x => x.status !== 'OFFLINE'
                      ).length ??
                      0} active technician(s)
                    {' • '}
                    {t.technicians?.length ?? 0} listed
                  </small>
                </div>

                <button
                  className="wfm-secondary-btn"
                  onClick={() => openTeamEdit(t)}
                >
                  Rename
                </button>

                      <button
                        type="button"
                        className="wfm-danger-btn"
                        disabled={busy !== ''}
                        title="Permanently delete team"
                        onClick={() => requestTeamDelete(t)}
                      >
                        Delete
                      </button>
              </div>
            ) : (
              <div className="wfm-empty">
                No teams have been created yet.
              </div>
            )}
          </div>
        </div>

      </div>

      <div className="wfm-panel">

        <div className="wfm-section-title">
          <div>
            <span className="wfm-eyebrow">ACCOUNT DIRECTORY</span>
            <h3>WFM Users</h3>
          </div>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search user, email, role or status"
          />
        </div>

        {loading ? (
          <div className="wfm-empty">Loading users...</div>
        ) : (
          <div className="wfm-table-wrap">
            <table className="wfm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Field Status</th>
                  <th>Account</th>
                  <th>Management</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(u =>
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <small>
                        {u.email}
                        {u.phone ? ` • ${u.phone}` : ''}
                      </small>
                    </td>

                    <td>{u.role.replaceAll('_',' ')}</td>

                    <td>
                      {teams.find(t => t.id === u.teamId)?.name || '—'}
                    </td>

                    <td>
                      <span className={
                        `wfm-badge ${
                          u.status === 'WORKING'
                            ? 'working'
                            : 'assigned'
                        }`
                      }>
                        {u.status}
                      </span>
                    </td>

                    <td>
                      <span className={
                        `wfm-badge ${
                          u.isActive ? 'smart' : 'on-hold'
                        }`
                      }>
                        {u.isActive ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>

                    <td>
                      <div className="wfm-user-actions">

                        <button
                          className="wfm-secondary-btn"
                          onClick={() => openEdit(u)}
                          disabled={busy !== ''}
                        >
                          Edit
                        </button>

                        <button
                          className="wfm-secondary-btn"
                          onClick={() => openPassword(u)}
                          disabled={busy !== ''}
                        >
                          Reset Password
                        </button>

                        <button
                          className={
                            u.isActive
                              ? 'wfm-danger-btn'
                              : 'wfm-primary-btn'
                          }
                          disabled={
                            busy !== '' ||
                            u.id === session.user.id
                          }
                          onClick={() => toggle(u)}
                        >
                          {busy === `status-${u.id}`
                            ? 'Working...'
                            : u.isActive
                              ? 'Disable'
                              : 'Enable'}
                        </button>



                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {!filtered.length &&
              <div className="wfm-empty">
                No users match this search.
              </div>
            }
          </div>
        )}
      </div>

      {editing &&
        <div className="wfm-admin-modal-backdrop">
          <div className="wfm-admin-modal">

            <div className="wfm-admin-modal-head">
              <div>
                <span className="wfm-eyebrow">ADMINISTRATOR</span>
                <h3>Edit User</h3>
                <small>{editing.email}</small>
              </div>

              <button
                className="wfm-secondary-btn"
                onClick={() => setEditing(null)}
              >
                Close
              </button>
            </div>

            <form
              className="wfm-user-form"
              onSubmit={saveUser}
              autoComplete="off"
            >
              <div className="wfm-user-form-grid">

                <div className="wfm-form-field">
                  <label>Name</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={e => setEditForm(x => ({
                      ...x,
                      name:e.target.value
                    }))}
                  />
                </div>

                <div className="wfm-form-field">
                  <label>Email / Username</label>
                  <input
                    required
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm(x => ({
                      ...x,
                      email:e.target.value
                    }))}
                  />
                </div>

                <div className="wfm-form-field">
                  <label>Role</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm(x => ({
                      ...x,
                      role:e.target.value
                    }))}
                  >
                    {ROLES.map(r =>
                      <option key={r}>{r}</option>
                    )}
                  </select>
                </div>

                <div className="wfm-form-field">
                  <label>Team</label>
                  <select
                    value={editForm.teamId}
                    onChange={e => setEditForm(x => ({
                      ...x,
                      teamId:e.target.value
                    }))}
                  >
                    <option value="">No team</option>
                    {teams.map(t =>
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    )}
                  </select>
                </div>

                <div className="wfm-form-field">
                  <label>Phone</label>
                  <input
                    value={editForm.phone}
                    onChange={e => setEditForm(x => ({
                      ...x,
                      phone:e.target.value
                    }))}
                  />
                </div>

              </div>

              <div className="wfm-user-form-actions">
                <button
                  className="wfm-primary-btn"
                  disabled={busy === `edit-${editing.id}`}
                >
                  {busy === `edit-${editing.id}`
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>

                <button
                  type="button"
                  className="wfm-secondary-btn"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
        </div>
      }

      {passwordUser &&
        <div className="wfm-admin-modal-backdrop">
          <div className="wfm-admin-modal wfm-admin-modal-small">

            <div className="wfm-admin-modal-head">
              <div>
                <span className="wfm-eyebrow">SECURITY</span>
                <h3>Reset Password</h3>
                <small>{passwordUser.name}</small>
              </div>
            </div>

            <form
              className="wfm-user-form"
              onSubmit={resetPassword}
              autoComplete="off"
            >
              <div className="wfm-form-field">
                <label>New Password</label>
                <input
                  required
                  minLength={12}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="wfm-user-form-actions">
                <button
                  className="wfm-primary-btn"
                  disabled={
                    busy === `password-${passwordUser.id}` ||
                    newPassword.length < 12
                  }
                >
                  {busy === `password-${passwordUser.id}`
                    ? 'Resetting...'
                    : 'Reset Password'}
                </button>

                <button
                  type="button"
                  className="wfm-secondary-btn"
                  onClick={() => {
                    setPasswordUser(null);
                    setNewPassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
        </div>
      }

      {deleteTarget &&
        <div
          className="wfm-admin-modal-backdrop"
          onMouseDown={cancelDelete}
        >
          <div
            className="wfm-admin-modal wfm-admin-modal-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-management-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="wfm-admin-modal-head">
              <div>
                <span className="wfm-eyebrow">
                  ADMINISTRATOR
                </span>

                <h3 id="delete-management-title">
                  Delete Team
                </h3>
              </div>
            </div>

            <div className="wfm-delete-confirm">
              <p>
                Permanently delete{' '}
                <strong>{deleteTarget.label}</strong>
                {deleteTarget.detail
                  ? ` (${deleteTarget.detail})`
                  : ''}
                ?
              </p>

              <p className="wfm-delete-warning">
                This action cannot be undone. Deletion will be blocked
                when protected operational or historical records exist.
              </p>

              {deleteError &&
                <div
                  className="wfm-delete-error"
                  role="alert"
                >
                  {deleteError}
                </div>
              }

              <div className="wfm-user-form-actions">
                <button
                  type="button"
                  className="wfm-danger-btn"
                  disabled={busy === 'delete'}
                  onClick={confirmDelete}
                >
                  {busy === 'delete'
                    ? 'Deleting...'
                    : 'Delete permanently'}
                </button>

                <button
                  type="button"
                  className="wfm-secondary-btn"
                  disabled={busy === 'delete'}
                  onClick={cancelDelete}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      {editingTeam &&
        <div className="wfm-admin-modal-backdrop">
          <div className="wfm-admin-modal wfm-admin-modal-small">

            <div className="wfm-admin-modal-head">
              <div>
                <span className="wfm-eyebrow">FIELD ORGANIZATION</span>
                <h3>Rename Team</h3>
              </div>
            </div>

            <form
              className="wfm-user-form"
              onSubmit={saveTeam}
              autoComplete="off"
            >
              <div className="wfm-form-field">
                <label>Team Name / Number</label>
                <input
                  required
                  value={editTeamName}
                  onChange={e => setEditTeamName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="wfm-user-form-actions">
                <button
                  className="wfm-primary-btn"
                  disabled={
                    busy === `team-${editingTeam.id}` ||
                    !editTeamName.trim()
                  }
                >
                  {busy === `team-${editingTeam.id}`
                    ? 'Saving...'
                    : 'Save Team'}
                </button>

                <button
                  type="button"
                  className="wfm-secondary-btn"
                  onClick={() => setEditingTeam(null)}
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
        </div>
      }

    </div>
  );
}

function K({label,v}:{label:string;v:number}) {
  return (
    <div className="wfm-kpi">
      <span>{label}</span>
      <strong>{v}</strong>
    </div>
  );
}
