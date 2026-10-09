import { authReady, currentUser } from './auth.js';
import { closeAccountMenu } from './account-menu.js';
import { createSounds } from './sounds.js';

createSounds();
const $ = id => document.getElementById(id);
$('settings-button').onclick = () => { closeAccountMenu(); $('settings-dialog').showModal(); };
$('settings-back').onclick = () => $('settings-dialog').close();
for (const dialog of [$('auth-dialog'), $('settings-dialog')]) {
  dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => dialog.close(); });
}
// Refresh protected page content when login/logout changes the active account.
let accountId;
authReady.then(() => { accountId = currentUser?.id; });
document.addEventListener('accountchange', event => {
  if (accountId !== event.detail?.id) location.reload();
  accountId = event.detail?.id;
});
