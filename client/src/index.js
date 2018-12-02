import React from "react";
import ReactDOM from "react-dom";
import {
  createGenerateClassName,
  createMuiTheme,
  jssPreset,
  MuiThemeProvider
} from "@material-ui/core/styles";
import CssBaseline from "@material-ui/core/CssBaseline";

// Fix css insertion order
// https://material-ui.com/customization/css-in-js/#css-injection-order
import JssProvider from "react-jss/lib/JssProvider";
import { create } from "jss";
import App from "./app";

const generateClassName = createGenerateClassName();
const jss = create({
  ...jssPreset(),
  // We define a custom insertion point that JSS will look for injecting the styles in the DOM.
  insertionPoint: document.getElementById("jss-insertion-point")
});

const theme = createMuiTheme({
  typography: {
    useNextVariants: true,
    fontFamily: `'Share Tech Mono', monospace`
  },
  palette: {
    type: "dark"
  },
  props: {
    MuiButtonBase: {
      disableRipple: true // No more ripple, on the whole application
    }
  }
});

const Root = () => (
  <JssProvider jss={jss} generateClassName={generateClassName}>
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <App/>
    </MuiThemeProvider>
  </JssProvider>
);

const rootElement = document.getElementById("root");
ReactDOM.render(<Root />, rootElement);

if (module.hot) {
  module.hot.accept();
}

// const render = Component => {
//   return ReactDOM.render(
//     <Provider store={store}>
//       <BrowserRouter>
//         <Component />
//       </BrowserRouter>
//     </Provider>,
//     document.getElementById('root')
//   );
// };
//
// render(App);
//
// if (module.hot) {
//   module.hot.accept('./App', () => {
//     const NextApp = require('./App').default;
//     render(NextApp);
//   });
// }