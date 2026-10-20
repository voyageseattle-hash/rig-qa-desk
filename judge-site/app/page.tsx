import JudgeDesk from './judge-desk';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from './chatgpt-auth';
import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  const ownerAllowanceReviewAvailable=Boolean(user&&env.NEBIUS_LIVE_ALLOWED==='0'&&env.JUDGE_ALLOWANCE_UPDATE_APPROVED==='1'&&createHash('sha256').update(user.userId).digest('hex')===env.JUDGE_ALLOWANCE_OWNER_HASH);
  return <main>
    <header className="topbar"><a className="brand" href="/">RIG QA DESK</a><span>Rig &amp; animation export review</span><a href={user ? chatGPTSignOutPath('/') : chatGPTSignInPath('/')} target="_top">{user ? 'Sign out' : 'Sign in with ChatGPT'}</a></header>
    <JudgeDesk signedIn={Boolean(user)} ownerAllowanceReviewAvailable={ownerAllowanceReviewAvailable} />
    <footer><p>Independent companion. Original assets stay unchanged.</p><p>Character measurements run locally in your browser. The separate guided AI workflow uses owned procedural data. Official Khronos conformance validation remains available in the Node companion; it is not performed by the local character screen.</p></footer>
  </main>;
}
