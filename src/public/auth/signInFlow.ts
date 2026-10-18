import type { NavigateFunction } from 'react-router-dom';
import type { SignInResult } from '@/services/authService';
import { completeSignIn, issueCode, trustDevice } from '@/services/authService';
import { useAuthFlowStore } from '@/stores/authFlowStore';

/** Route the user to the next sign-in step after password, SSO or 2-step. */
export function continueSignIn(result: SignInResult, navigate: NavigateFunction, opts: { remember: boolean; next: string | null; viaSso?: boolean }) {
  if (result.status !== 'ok' && result.status !== 'twoStep' && result.status !== 'chooseCompany') return false;
  const flow = useAuthFlowStore.getState();
  if (result.status === 'twoStep' && !opts.viaSso) {
    flow.start({ userId: result.user.id, remember: opts.remember, next: opts.next, viaSso: opts.viaSso });
    issueCode('twoStep', result.user.email);
    navigate('/sign-in/two-step');
    return true;
  }
  if (opts.remember) trustDevice(result.user.id);
  if (result.orgs.length > 1) {
    flow.start({ userId: result.user.id, remember: opts.remember, next: opts.next, viaSso: opts.viaSso });
    navigate('/choose-company');
    return true;
  }
  // The pending flow is cleared by the app shell once it mounts, so the step pages never redirect mid-navigation.
  completeSignIn(result.user, result.orgs[0]!.id);
  navigate(opts.next ?? '/app');
  return true;
}
