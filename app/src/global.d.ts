// CSS/CSS-module import은 Metro 번들러(및 react-native-css)가 처리한다.
// tsc가 사이드이펙트/모듈 CSS import를 타입 오류로 보지 않도록 선언.
declare module "*.css";
declare module "*.module.css";
