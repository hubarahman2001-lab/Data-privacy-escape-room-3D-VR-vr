"""Build the SCORM packages (1.2 and 2004) from the game files.
Run from the repo root:   python3 scorm/build.py
Output: dist/LockDownTheOffice_VR_SCORM12.zip and dist/LockDownTheOffice_VR_SCORM2004.zip"""
import os, zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLE = 'Lock Down the Office: VR data privacy escape room'
ID = 'LockDownTheOffice_VR'
GAME_PARTS = ['index.html', 'js', 'lib', 'assets', '.nojekyll']


def game_files():
    out = []
    for part in GAME_PARTS:
        p = os.path.join(ROOT, part)
        if os.path.isfile(p):
            out.append(part)
        elif os.path.isdir(p):
            for d, _, fs in os.walk(p):
                for f in sorted(fs):
                    out.append(os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/'))
    return out


def manifest(version, files):
    file_tags = '\n'.join(f'      <file href="{escape(f)}"/>' for f in files)
    if version == '1.2':
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{ID}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>{escape(TITLE)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>{escape(TITLE)}</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
{file_tags}
    </resource>
  </resources>
</manifest>
'''
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{ID}" version="1"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 3rd Edition</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>{escape(TITLE)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>{escape(TITLE)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormType="sco" href="index.html">
{file_tags}
    </resource>
  </resources>
</manifest>
'''


def build(version, name):
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    gf = game_files()
    pkg = ['index.html'] + ['game/' + f for f in gf]
    path = os.path.join(ROOT, 'dist', name)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('imsmanifest.xml', manifest(version, pkg))
        z.write(os.path.join(ROOT, 'scorm', 'launcher.html'), 'index.html')
        for f in gf:
            z.write(os.path.join(ROOT, f), 'game/' + f)
    print(f'{name}: {len(pkg)} files, {os.path.getsize(path) // 1024} KB')


build('1.2', 'LockDownTheOffice_VR_SCORM12.zip')
build('2004', 'LockDownTheOffice_VR_SCORM2004.zip')
