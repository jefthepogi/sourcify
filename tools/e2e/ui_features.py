# Optional browser run for the profile, preview and quick-access features.
# Needs `pip install playwright pillow && playwright install chromium` and `npm run dev` running.
import os
from PIL import Image, ImageDraw
os.makedirs('/tmp/shots', exist_ok=True)
im = Image.new('RGB', (900, 640), '#fffdf5'); ImageDraw.Draw(im).text((300, 250), 'CERTIFICATE OF COMPLETION', fill='#111827'); im.save('/tmp/sample.png')
open('/tmp/sample.pdf', 'wb').write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 40 100 Td (Certificate PDF sample) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n")
open('/tmp/cert.txt', 'w').write('Certificate of Completion for Test Recipient 12345\n' + 'line\n' * 30)
open('/tmp/blob.bin', 'wb').write(bytes(range(256)))
import re
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1440,'height':1100}); pg = ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:4200/issuer/issue'); pg.wait_for_selector('h1'); pg.wait_for_timeout(1500)
    # 2) profiles
    print('wallet pill :', pg.locator('.wallet .wid').inner_text().replace('\n',' | '))
    print('avatar      :', pg.locator('.avatar').inner_text())
    pg.locator('.wallet').click(); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/shots/10-menu.png')
    pg.locator('.menu button[role=menuitem]').nth(1).click(); pg.wait_for_timeout(800)
    print('after switch:', pg.locator('.wallet .wid').inner_text().replace('\n',' | '), '| role from chain')
    pg.locator('.wallet').click(); pg.fill('#nick','Front Desk Laptop'); pg.get_by_role('button', name='Save').click(); pg.wait_for_timeout(300)
    print('nickname    :', pg.locator('.wallet .wid b').inner_text())
    pg.reload(); pg.wait_for_timeout(1500); print('after reload:', pg.locator('.wallet .wid b').inner_text())
    # 3) previews
    for f,label in [('/tmp/sample.png','image'),('/tmp/cert.txt','text'),('/tmp/sample.pdf','pdf'),('/tmp/blob.bin','other')]:
        pg.set_input_files('#file', f); pg.wait_for_timeout(700)
        st = pg.locator('app-file-preview .stage'); print(f'preview {label:5}:', st.get_attribute('class'),
          '| img' if st.locator('img').count() else '', '| object' if st.locator('object').count() else '', '| pre:'+st.locator('pre').inner_text()[:30].replace('\n',' ') if st.locator('pre').count() else '')
        if label=='image': pg.locator('app-file-preview').scroll_into_view_if_needed(); pg.screenshot(path='/tmp/shots/11-preview-image.png')
        if label=='text': pg.screenshot(path='/tmp/shots/12-preview-text.png')
        if label=='other': pg.screenshot(path='/tmp/shots/13-preview-other.png')
    pg.set_input_files('#file','/tmp/sample.png'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Remove').click(); pg.wait_for_timeout(300)
    print('after remove: preview count =', pg.locator('app-file-preview').count(), '| docHash field:', pg.locator('input[aria-label=docHash]').input_value()[:30])
    # 1) quick-go tab
    pg.locator('a.nav.quick').click(); pg.wait_for_url('**/verify'); print('sidebar tab ->', pg.url)
    pg.screenshot(path='/tmp/shots/14-verify-from-tab.png')
    pg.goto('http://127.0.0.1:4200/issuer/issue'); pg.wait_for_selector('h1'); pg.locator('a.vbtn').click(); pg.wait_for_url('**/verify'); print('top button  ->', pg.url)
    pg.locator('a.back').click(); pg.wait_for_url('**/issuer/issue'); print('back link   ->', pg.url)
    # profiles on ledger / issuers pages
    pg.goto('http://127.0.0.1:4200/issuer/credentials'); pg.wait_for_selector('text=Amara Okafor'); pg.wait_for_timeout(800)
    print('ledger sub  :', pg.locator('table td .sub').first.inner_text())
    pg.screenshot(path='/tmp/shots/15-ledger.png')
    pg.goto('http://127.0.0.1:4200/issuer/audit'); pg.wait_for_timeout(1200); pg.screenshot(path='/tmp/shots/16-audit.png')
    pg.goto('http://127.0.0.1:4200/issuer/issuers'); pg.wait_for_timeout(1200); pg.screenshot(path='/tmp/shots/17-issuers.png')
    print('errors:', [e for e in errs if 'favicon' not in e][:5]); b.close()
