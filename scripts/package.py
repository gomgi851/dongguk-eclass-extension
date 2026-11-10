"""Build a store-compatible ZIP and release notes from the checked-in sources."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'extension'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag')
    args = parser.parse_args()
    manifest = json.loads((EXTENSION / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', version):
        raise SystemExit('Invalid manifest version')
    if args.tag and args.tag != 'v' + version:
        raise SystemExit('Tag and manifest version do not match')
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    if package['version'] != version:
        raise SystemExit('package.json and manifest version do not match')
    changelog = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')
    match = re.search(r'^## ' + re.escape(version) + r'\s[^\n]*\n(.*?)(?=^## |\Z)', changelog, re.M | re.S)
    if not match or '변경 내용을 작성하세요' in match.group(1) or not match.group(1).strip():
        raise SystemExit('Write release notes in CHANGELOG.md first')
    (EXTENSION / 'CHANGELOG.md').write_text(changelog, encoding='utf-8')
    required = ['manifest.json', 'background.js', 'offscreen.html', 'dashboard.html', 'diagnostics.js',
                'icons/icon128.png', 'fonts/Jalnan2.otf', 'licenses/FONT-NOTICE.md', 'licenses/Jalnan-Official-Guide.pdf']
    for name in required:
        if not (EXTENSION / name).is_file():
            raise SystemExit('Missing packaged file: ' + name)
    files = sorted(p for p in EXTENSION.rglob('*') if p.is_file())
    for path in files:
        if path.is_symlink() or path.suffix.lower() in {'.pem', '.key', '.log', '.crx'} or path.name.startswith('.env'):
            raise SystemExit('Unexpected packaged file: ' + str(path))
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    artifact = dist / f'dongguk-eclass-{version}.zip'
    with zipfile.ZipFile(artifact, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(EXTENSION).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    with zipfile.ZipFile(artifact) as archive:
        assert archive.testzip() is None
        assert 'manifest.json' in archive.namelist()
        assert json.loads(archive.read('manifest.json'))['version'] == version
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    (dist / 'SHA256SUMS.txt').write_text(digest + '  ' + artifact.name + '\n', encoding='utf-8')
    intro = f'# Dongguk e-Class v{version}\n\n'
    if version == '0.7.2':
        intro += '첫 GitHub 베타 배포입니다. 2026-11-10에 저장소·설치 안내·개발 문서·합성 테스트·태그 기반 배포 자동화를 함께 공개했습니다. 아래 수정 내역은 기존 개발 이력입니다.\n\n'
    notes = intro + match.group(1).strip() + '\n\n## 설치\n첨부된 ZIP을 압축 해제한 뒤 Chrome 확장 관리 화면에서 manifest.json이 들어 있는 폴더를 로드하세요. 기존 사용자는 확장과 e-Class 페이지를 모두 새로고침하세요.\n\n## 범위\n초기 베타이며 학교 공식 도구가 아닙니다. 모든 실제 강좌·설치 환경을 검증하지 않았습니다. 퀴즈·설문·Teams 강의·공지로만 안내된 과제는 집계하지 않습니다.\n\n[전체 변경 내역](https://github.com/gomgi851/dongguk-eclass-extension/blob/main/CHANGELOG.md) · [사용 안내](https://github.com/gomgi851/dongguk-eclass-extension#설치)\n'
    (dist / 'RELEASE_NOTES.md').write_text(notes, encoding='utf-8')
    print(f'Built {artifact.name}: {len(files)} files; root manifest, notes and SHA256 verified')

if __name__ == '__main__':
    main()
