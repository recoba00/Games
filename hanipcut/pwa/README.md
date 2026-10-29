# 한입컷 PWA / Microsoft Store

현재 결과물은 **설치 가능한 PWA 웹 번들**입니다. `hanipcut-pwa.zip`은 웹 호스팅용이며 Partner Center에 직접 업로드하는 MSIX가 아닙니다. 아래 출시 차단 항목을 해결한 뒤 HTTPS에 배포하고 Windows 패키지를 생성하세요.

## 빌드와 실행

저장소 루트에서 실행합니다. Python 3.10+가 필요합니다.

```powershell
python -m pip install -r pwa/requirements.txt
python pwa/build.py
python -m http.server 8080 --bind 127.0.0.1 --directory pwa/dist
```

Edge에서 `http://localhost:8080/`을 열고 앱 설치 메뉴를 사용합니다. `file://`로 열면 서비스 워커가 동작하지 않습니다.

- `pwa/dist/`: 배포할 모든 파일
- `pwa/hanipcut-pwa.zip`: 같은 내용의 호스팅용 ZIP
- `bb/`, `ait/`의 소스와 빌드에는 영향을 주지 않습니다.
- 기존 마스코트 기반 192/512 PNG 아이콘, manifest, 로컬 Jua 폰트가 포함됩니다. 원본 마스코트는 132px이므로 스토어 마케팅용 고해상도 원화는 별도 준비를 권장합니다.
- 최초 온라인 로딩과 서비스 워커 설치가 끝난 뒤 오프라인 실행이 가능합니다. 음악·영상·음식 이미지 전체를 캐시하며 영상의 부분 요청도 처리합니다.
- 업데이트는 기존 앱 창을 모두 닫은 뒤 다시 열면 적용됩니다. 새 버전 다운로드를 위해 온라인 접속이 필요합니다. 빌드 내용으로 캐시 버전을 계산하며 게임 기록은 업데이트로 초기화하지 않습니다. 브라우저 데이터 삭제 시 로컬 기록은 삭제됩니다.

## 검증

Windows의 Microsoft Edge가 설치되어 있어야 합니다.

```powershell
python -m pip install -r pwa/requirements-test.txt
python pwa/build.py
python -m unittest discover -s pwa -p "test_*.py"
```

실제 Edge에서 하위 경로의 게임 로드, manifest/아이콘 응답, 서비스 워커 활성화, 오프라인 재탐색, 저장 기록 유지, 오프라인 음식 및 영상 Range 응답을 검증합니다. Store 심사나 Windows 패키지 설치 검사를 대신하지 않습니다.

## 출시 차단 항목 — 아직 해결되지 않음

게임 본체의 다음 기능은 기존 웹 데모 상태입니다. 이 번들을 그대로 Store 출시용이라고 제출하지 마세요.

1. 토스 로그인·알림 동의의 SDK 예시 화면, FakeAd, 포인트/현금 보상 문구: Windows에서 제공할 실제 기능으로 연결하거나 해당 흐름을 제거해야 합니다. 현재 실제 로그인·광고·현금 지급을 제공하지 않습니다.
2. 게임 설정의 약관·개인정보처리방침에는 `[운영사명]` 등 초안 정보가 남아 있습니다. 실제 운영 주체, 연락처, 데이터 처리에 맞는 문서 및 공개 개인정보처리방침 URL을 확정해야 합니다.
3. 앱 이름 예약, 스토어 설명·스크린샷·연령 등급·배포 국가 등 Partner Center 등록 정보를 준비해야 합니다.
4. HTTPS 주소는 `https://hanipcut.vercel.app/`이며 Partner Center 식별정보도 확보했습니다. Windows 패키지 생성은 아래 명령으로 수행합니다. 로컬 설치 검증 및 Store 제출은 별도 단계입니다.

Partner Center의 Windows 패키지 식별정보(PWABuilder 입력용):

| 필드 | 값 |
|---|---|
| Package ID (Package/Identity/Name) | `GRF.hanip-cut` |
| Publisher ID (Package/Identity/Publisher) | `CN=5A90E1D7-EE51-44E5-9460-1BC5D5265033` |
| Publisher display name | `Gurucompany` |
| Store ID (참고) | `9PMVB4PGX4QG` |

이 값은 웹 매니페스트가 아니라 Windows 패키지 생성 옵션에 입력합니다.

## Windows 패키지 직접 생성

```powershell
python pwa/package-windows.py
```

PWABuilder 공식 `/msix/generateZip` API를 호출합니다. 설정은 `windows-package.json`입니다. `@pwabuilder/cli`는 PWA Starter 생성/Vite 빌드용이며 Windows 패키징 명령을 제공하지 않습니다.

- Store 업로드 파일: `pwa/windows/hanipcut-1.0.1.0.msixbundle`
- 전체 결과(테스트용 sideload 패키지와 설치 도구 포함): `pwa/windows/hanipcut-windows-1.0.1.0.zip`
- 패키지 버전은 `1.0.1.0`입니다. 패키징 서비스가 major 0을 거부하므로 게임 내부 버전 `0.9.35`와 별도로 관리합니다. 다음 제출 때는 이전 Store 버전보다 올려야 합니다.
- `allowSigning:true`는 Store가 서명할 수 있는 패키지를 생성하는 옵션입니다. false는 Publisher에 unsigned OID를 붙여 Store identity와 달라지므로 사용하지 않습니다. 개인 인증서를 설치하거나 서명하지 않습니다.
- 생성 스크립트가 ZIP 및 내부 패키지의 Identity Name/Publisher/Version, PublisherDisplayName, 실행 URL을 확인한 뒤 저장합니다. Windows 10 build 19041+의 Edge 기반 modern 패키지만 생성합니다.
- 전체 ZIP의 sideload 패키지는 로컬 테스트용입니다. Store에는 `.msixbundle`을 제출합니다. 패키지 생성 성공이 설치 테스트·심사 승인 또는 앞서 명시한 게임 출시 차단 항목의 해결을 뜻하지 않습니다.

## HTTPS 배포 및 Store 패키징

현재 Vercel 프로젝트는 `bbumjins-projects/hanipcut`, 공개 주소는 `https://hanipcut.vercel.app/`입니다. 저장소 루트에서 아래 순서로 기존 프로젝트에 배포합니다. 빌드가 `dist/`를 다시 만들므로 link는 빌드 후 실행합니다. `vercel.json`도 빌드에 포함되며 HTML/manifest/SW 캐시 헤더를 설정합니다.

```powershell
python pwa/build.py
python -m unittest discover -s pwa -p "test_*.py"
vercel link --cwd pwa/dist --project hanipcut --scope bbumjins-projects --yes
vercel deploy --cwd pwa/dist --scope bbumjins-projects --prod --yes
```

1. `dist/` 내용을 안정적인 HTTPS 주소에 호스팅합니다. 하위 경로도 지원합니다. 폴더 URL은 `/`로 끝나도록 리다이렉트하고 모든 파일은 같은 경로 구조로 제공하세요.
2. `index.html`, `sw.js`, `manifest.webmanifest`는 `Cache-Control: no-cache`로 제공합니다. 서비스 워커 MIME은 JavaScript, manifest는 `application/manifest+json`을 사용하세요. 없는 파일에 HTML을 반환하는 SPA fallback은 사용하지 마세요. 배포를 원자적으로 전환해 새 HTML과 이전 에셋이 혼합되지 않게 하세요. R2/CDN 배포 시 상위 `AGENTS.md`의 불변 릴리스 경로 규칙에 맞는 배포 작업이 별도로 필요합니다.
3. 배포 URL에서 설치, 게임 진행, 앱 재실행 및 오프라인 실행을 확인합니다.
4. [Partner Center](https://partner.microsoft.com/dashboard)에서 **Apps and games → New product → MSIX or PWA app**으로 이름을 예약합니다.
5. **Product management → Product Identity**의 Package ID, Publisher ID, Publisher display name을 확보합니다. 임의 값을 만들지 마세요.
6. [PWABuilder](https://www.pwabuilder.com/)에 HTTPS URL을 입력하고 검사 항목을 해결한 뒤 **Package for Stores → Windows**에서 위 식별정보로 패키지를 생성합니다.
7. 다운로드한 Windows 패키지를 로컬 설치·검증한 뒤 Partner Center에 제출합니다. PWABuilder가 제공한 제출용 `.msixbundle` 등 파일을 사용하며, 이 저장소의 웹 ZIP을 제출하지 않습니다.

공식 절차: [Microsoft Learn — Publish a PWA to the Microsoft Store](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store).


Store 재제출: 이전 1.0.0.0 패키지는 미예약 한글 DisplayName 때문에 거부되었습니다. 1.0.1.0 패키지의 예약 영문 이름을 사용하세요. 기존 거부 파일을 제거하고 새 파일을 업로드한 뒤 Partner Center 검증 결과를 확인합니다.


한입컷 예약명 최종 정정: `hanip-cut`. 한입컷 제출 파일은 `windows/hanipcut-1.0.2.0.msixbundle`을 사용합니다. `hanipcut` 표시 이름의 1.0.1.0은 대체되었습니다. Package Identity는 계속 `GRF.hanip-cut`입니다. 다른 게임의 1.0.1.0 번들은 이 정정과 무관합니다.
