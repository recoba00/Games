import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'hanipcut',            // 콘솔에 등록한 앱 이름과 같아야 함
  brand: { primaryColor: '#F79024' },
  permissions: [],
  // 토스 고유 헤더: 다크 테마 + 투명 배경(게임 권장), 타이틀 없음
  navigationBar: {
    theme: 'dark',
    transparentBackground: true,
    withTitle: false,
  },
  webView: {
    allowsInlineMediaPlayback: true,          // 인트로 영상 인라인 재생
    mediaPlaybackRequiresUserAction: false,   // 음소거 자동재생 허용
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
