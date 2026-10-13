import JudgeDesk from './judge-desk';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  return <main>
    <header className="topbar"><a className="brand" href="/">RIG QA DESK</a><span>Rig &amp; animation export review</span><a href={user ? chatGPTSignOutPath('/') : chatGPTSignInPath('/')} target="_top">{user ? 'Sign out' : 'Sign in with ChatGPT'}</a></header>
    <JudgeDesk signedIn={Boolean(user)} />
    <footer><p>Independent companion · NVIDIA Nemotron through Nebius Token Factory · Original assets stay unchanged.</p><p>The hosted guided test uses owned procedural data. The downloadable Node app also supports owned GLB imports and separate official conformance checks. Source and download destinations are awaiting release approval.</p></footer>
  </main>;
}
