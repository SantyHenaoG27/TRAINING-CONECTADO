(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.replace('login.html');
    return;
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role, nombre, session_code')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== REQUIRED_ROLE) {
    window.location.replace(profile?.role === 'admin' ? 'admin.html' : 'student.html');
    return;
  }

  window.currentUser = { id: session.user.id, email: session.user.email, ...profile };

  const label = document.getElementById('userLabel');
  if (label) label.textContent = profile.nombre || session.user.email;

  window.handleLogout = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  };

  document.body.style.visibility = 'visible';
  window.__authComplete = true;
  window.dispatchEvent(new CustomEvent('authReady', { detail: window.currentUser }));
})();
