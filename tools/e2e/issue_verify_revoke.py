# Optional browser run (needs `pip install playwright && playwright install chromium` and `npm run dev` running).
# Drives: issue -> pin -> sign -> mint -> verify (VALID) -> NOT FOUND -> revoke -> REVOKED.
import re, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1440,'height':1024}); pg = ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4200/issuer/issue'); pg.wait_for_selector('h1'); pg.wait_for_timeout(1500)
    pg.screenshot(path='/tmp/shots/01-empty.png')
    open('/tmp/cert.txt','w').write('Certificate of Completion for Test Recipient 12345')
    pg.fill('#name','Test Recipient'); pg.fill('#email','test@example.edu'); pg.fill('#program','BSc Computer Science')
    pg.set_input_files('#file','/tmp/cert.txt'); pg.wait_for_timeout(2500)
    pg.screenshot(path='/tmp/shots/02-filled.png')
    btn = pg.get_by_role('button', name=re.compile('Review & Issue')); print('review enabled:', btn.is_enabled())
    btn.click(); pg.wait_for_selector('text=Confirm before signing'); pg.screenshot(path='/tmp/shots/03-review.png')
    pg.get_by_role('checkbox').check(); pg.get_by_role('button', name='Pin & Sign').click()
    pg.wait_for_selector('text=Credential issued', timeout=20000); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/shots/04-done.png')
    url = pg.locator('.url').inner_text(); print('verify url:', url)
    pg.get_by_role('button', name='Done').click()
    m = pg.context.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(url.replace('http://127.0.0.1:4200','http://127.0.0.1:4200')); m.wait_for_selector('text=VALID', timeout=15000); m.wait_for_timeout(2000); m.screenshot(path='/tmp/shots/05-valid.png')
    print('integrity:', m.locator('.integ').inner_text())
    m.goto('http://127.0.0.1:4200/verify/0x'+'ab'*32); m.wait_for_selector('text=NOT FOUND'); m.screenshot(path='/tmp/shots/06-notfound.png')
    pg.goto('http://127.0.0.1:4200/issuer/credentials'); pg.wait_for_selector('text=Test Recipient'); pg.screenshot(path='/tmp/shots/07-credentials.png')
    pg.get_by_role('button', name='Revoke').first.click(); pg.get_by_role('button', name='Confirm').click(); pg.wait_for_selector('.badge.bad', timeout=10000)
    m.goto(url); m.wait_for_selector('text=REVOKED', timeout=15000); m.screenshot(path='/tmp/shots/08-revoked.png')
    m.goto('http://127.0.0.1:4200/verify'); m.wait_for_timeout(1500); m.screenshot(path='/tmp/shots/09-manual.png')
    print('errors:', [e for e in errs if 'favicon' not in e][:5]); b.close()
