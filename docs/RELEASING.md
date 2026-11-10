# 버전 기록과 릴리스

루트 `CHANGELOG.md`가 변경 내역의 원본입니다. 확장 내부의 `extension/CHANGELOG.md`는 버전 스크립트·패키징 스크립트가 동기화합니다. 실제 동작 변경은 버전을 올리고, 문서만 정리하는 경우는 기존 버전 코드를 바꾸지 않아도 됩니다.

1. `npm run version -- 0.7.3`으로 버전과 표시 문구를 갱신합니다. 기존 버전보다 커야 합니다.
2. `CHANGELOG.md` 맨 위의 새 항목에 사용자에게 달라진 기능·수정·알려진 제한을 적습니다. 자리표시자가 남으면 빌드가 실패합니다. 이전 항목은 보존합니다.
3. `npm test` 후 실제 Chrome에 `extension/`을 로드해 영향을 받는 화면을 확인합니다. 계정·학습 원문은 커밋하지 않습니다.
4. `python scripts/package.py`로 ZIP, SHA256, 릴리스 노트를 확인합니다. ZIP 최상위에 `manifest.json`이 있어야 합니다.
5. 변경을 커밋하고 `v0.7.3` 태그를 같은 커밋에 붙인 뒤 main과 태그를 푸시합니다.
6. `Release` Actions가 성공하면 버전별 GitHub Release에 ZIP과 체크섬이 붙습니다. `0.x`는 prerelease로 표시합니다. Chrome 웹 스토어 제출은 별도입니다.

초기 v0.7.2는 기존 확장 기능을 처음 GitHub에 올리는 배포입니다. 2026-11-08의 개발 변경 내역은 기존 기록이며, 최초 GitHub 업로드일은 2026-11-10입니다. 과거 버전의 소스 태그나 릴리스를 거슬러 만들지 않습니다.

## CI가 실패할 때
테스트·태그/manifest 불일치·미작성 변경 내역을 먼저 고칩니다. 릴리스 생성 권한은 해당 작업의 `contents: write`에 한정됩니다. 저장소의 Actions 정책이 실행을 막으면 설정을 확인하세요.

같은 태그의 기존 릴리스나 첨부 파일을 덮어쓰지 않습니다. 수정 코드는 새 버전으로 배포합니다. 실패한 초안의 정리는 상태를 확인한 뒤 진행하세요.

## 수동 배포 대안
자동화가 계정 정책 등으로 실행되지 않는 경우:

```sh
npm test
python scripts/package.py --tag v0.7.3
gh release create v0.7.3 dist/dongguk-eclass-0.7.3.zip dist/SHA256SUMS.txt --verify-tag --title "Dongguk e-Class v0.7.3" --notes-file dist/RELEASE_NOTES.md --prerelease
```

정식 1.x 이후에는 검증 상태에 맞춰 prerelease 옵션을 결정하세요. 글꼴 라이선스 PDF·안내를 패키지에서 제거하지 마세요.
