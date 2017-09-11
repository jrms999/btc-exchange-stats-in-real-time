'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/* Imported Libs & Global vars
** ************************************** */
var R = R; // Ramda
var axios = axios;
var React = React;
var moment = moment;
var Reselect = Reselect;
var ReactDOM = ReactDOM;
var _ReactRedux = ReactRedux;
var connect = _ReactRedux.connect;
var Provider = _ReactRedux.Provider;

var thunkMiddleware = ReduxThunk.default;
var _Redux = Redux;
var createStore = _Redux.createStore;
var applyMiddleware = _Redux.applyMiddleware;

var domContainerNode = document.getElementById('react-app');

var DEBUG = false;
var FEED_URL = DEBUG ? 'wss://ws-feed-public.sandbox.gdax.com' : 'wss://ws-feed.gdax.com';
var API_URL = DEBUG ? 'https://api-public.sandbox.gdax.com' : 'https://api.gdax.com';
var PRODUCT_IDS = ['BTC-USD', 'BTC-EUR', 'BTC-GBP'];

var gdaxApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

/* Helper Functions
** ************************************** */
var _Helpers = Helpers;
var mapKeysToObject = _Helpers.mapKeysToObject;
var getNestedValue = _Helpers.getNestedValue;
var wait = _Helpers.wait;
var toQueryParams = _Helpers.toQueryParams;
var commaify = _Helpers.commaify;
var percentageChange = _Helpers.percentageChange;
var percentify = _Helpers.percentify;
var _ReactReduxHelpers = ReactReduxHelpers;
var connectStateValue = _ReactReduxHelpers.connectStateValue;
var connectValue = _ReactReduxHelpers.connectValue;
var createActionConnector = _ReactReduxHelpers.createActionConnector;

/* Action Types, Action Creators, Initial State & Reducers
** ************************************** */

var actionTypes = {
  // META TYPES
  'SET_ACTIVE_PRODUCT': 'SET_ACTIVE_PRODUCT',
  // FEED LIFECYLE TYPES
  'FEED_CONNECT': 'FEED_CONNECT',
  'FEED_SET_SOCKET': 'FEED_SET_SOCKET',
  // SOCKET EVENT TYPES
  'SOCKET_OPEN': 'SOCKET_OPEN',
  'SOCKET_CLOSE': 'SOCKET_CLOSE',
  'SOCKET_ERROR': 'SOCKET_ERROR',
  'SOCKET_MESSAGE': 'SOCKET_MESSAGE',
  // API REQUEST TYPES
  'API_PRODUCT_BOOK_REQUEST': 'API_PRODUCT_BOOK_REQUEST',
  'API_PRODUCT_BOOK_SUCCESS': 'API_PRODUCT_BOOK_SUCCESS',
  'API_PRODUCT_BOOK_FAILURE': 'API_PRODUCT_BOOK_FAILURE',
  'API_PRODUCT_STATS_REQUEST': 'API_PRODUCT_STATS_REQUEST',
  'API_PRODUCT_STATS_SUCCESS': 'API_PRODUCT_STATS_SUCCESS',
  'API_PRODUCT_STATS_FAILURE': 'API_PRODUCT_STATS_FAILURE',
  'API_PRODUCT_TICKER_REQUEST': 'API_PRODUCT_TICKER_REQUEST',
  'API_PRODUCT_TICKER_SUCCESS': 'API_PRODUCT_TICKER_SUCCESS',
  'API_PRODUCT_TICKER_FAILURE': 'API_PRODUCT_TICKER_FAILURE'
};

var actionCreators = {
  setActiveProduct: function setActiveProduct(dispatch) {
    return function (productId) {
      return dispatch({
        type: actionTypes['SET_ACTIVE_PRODUCT'],
        payload: { product_id: productId }
      });
    };
  },

  feedConnect: function feedConnect(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.FEED_CONNECT, payload: payload });
    };
  },

  feedSetSocket: function feedSetSocket(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.FEED_SET_SOCKET, payload: payload });
    };
  },

  socketOpen: function socketOpen(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.SOCKET_OPEN, payload: payload });
    };
  },

  socketClose: function socketClose(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.SOCKET_CLOSE, payload: payload });
    };
  },

  socketError: function socketError(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.SOCKET_ERROR, payload: payload });
    };
  },

  socketMessage: function socketMessage(dispatch) {
    return function (payload) {
      return dispatch({ type: actionTypes.SOCKET_MESSAGE, payload: payload });
    };
  },

  apiProductRequest: function apiProductRequest(dispatch) {
    return function (productId, endpoint) {
      var query = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      dispatch({
        type: actionTypes['API_PRODUCT_' + endpoint.toUpperCase() + '_REQUEST'],
        payload: { product_id: productId }
      });
      return gdaxApi('products/' + productId + '/' + endpoint + toQueryParams(query)).then(function (_ref) {
        var data = _ref.data;
        return dispatch({
          type: actionTypes['API_PRODUCT_' + endpoint.toUpperCase() + '_SUCCESS'],
          payload: R.set(R.lensProp('product_id'), productId, data)
        });
      }).catch(function (error) {
        return dispatch({
          type: actionTypes['API_PRODUCT_' + endpoint.toUpperCase() + '_FAILURE'],
          payload: error
        });
      });
    };
  }
};

var initialState = {
  feed: {
    error: null,
    socket: null,
    readyState: 3 // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
  },
  activeProductId: PRODUCT_IDS[0],
  productsById: mapKeysToObject(PRODUCT_IDS, function (id) {
    return {
      id: id,
      baseCurrency: id.split('-')[0],
      quoteCurrency: id.split('-')[1],
      stats: {
        lastTrade: 0,
        open: 0,
        '24HrHigh': 0,
        '24HrLow': 0,
        '24HrVolume': 0
      },
      messageQueue: [],
      hasSnapshot: false,
      ordersById: {},
      sizesByPrice: {}
    };
  })
};

/* Lens & Selectors
** ************************************** */
var feedLens = R.lensProp('feed');
var errorLens = R.compose(feedLens, R.lensProp('error'));
var socketLens = R.compose(feedLens, R.lensProp('socket'));
var readyStateLens = R.compose(feedLens, R.lensProp('readyState'));
var activeProductIdLens = R.lensProp('activeProductId');

var sideLens = R.lensProp('side');
var sizeLens = R.lensProp('size');
var priceLens = R.lensProp('price');
var remainingSizeLens = R.lensProp('remaining_size');

var productsByIdLens = R.lensProp('productsById');

var createProductLensHelper = function createProductLensHelper(productId) {
  return function () {
    var lensPathArray = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];
    return R.compose(R.lensPath, R.concat(['productsById', productId]))(lensPathArray);
  };
};

var productLensHelpersById = mapKeysToObject(PRODUCT_IDS, createProductLensHelper);

// Helper for applying messages in real-time
var applyMessageToStats = function applyMessageToStats(message) {
  var productId = arguments.length <= 1 || arguments[1] === undefined ? message.product_id : arguments[1];
  var productLensHelper = arguments.length <= 2 || arguments[2] === undefined ? productLensHelpersById[productId] : arguments[2];
  return R.set(productLensHelper(['stats', 'lastTrade']), +message.price);
};

var applyMessageToError = function applyMessageToError(message) {
  return R.set(errorLens, message);
};

var productHasSnapshot = function productHasSnapshot(message) {
  var productId = arguments.length <= 1 || arguments[1] === undefined ? message.product_id : arguments[1];
  var productLensHelper = arguments.length <= 2 || arguments[2] === undefined ? productLensHelpersById[productId] : arguments[2];
  return R.view(productLensHelper(['hasSnapshot']));
};

var applyMessageToOrders = function applyMessageToOrders(message) {
  var productId = arguments.length <= 1 || arguments[1] === undefined ? message.product_id : arguments[1];
  var productLensHelper = arguments.length <= 2 || arguments[2] === undefined ? productLensHelpersById[productId] : arguments[2];
  return function (state) {
    var orderLens = productLensHelper(['ordersById', message.order_id]);
    var order = R.view(orderLens, state) || {};
    switch (message.type) {
      //     case ('open') :
      //       // console.log('open', message)
      //       // return R.set(
      //       //   orderLens,
      //       //   R.merge(),
      //       //   state
      //       // )
      //     case ('done') :

      //     case ('match') :

      //     case ('change') :

      default:
        return state;
    }
  };
};

var enqueueMessage = function enqueueMessage(message) {
  var productId = arguments.length <= 1 || arguments[1] === undefined ? message.product_id : arguments[1];
  var productLensHelper = arguments.length <= 2 || arguments[2] === undefined ? productLensHelpersById[productId] : arguments[2];
  return function (state) {
    return R.set(productLensHelper(['messageQueue']), R.prepend(message, R.view(productLensHelper(['messageQueue']), state)), state);
  };
};
// ) => R.set(
//   productLensHelper(['messageQueue']),
//   R.prepend(message, R.view(productLensHelper(['messageQueue'])))   
// )

// Root Reducer
var rootReducer = function rootReducer() {
  var state = arguments.length <= 0 || arguments[0] === undefined ? initialState : arguments[0];
  var _ref2 = arguments[1];
  var type = _ref2.type;
  var _ref2$payload = _ref2.payload;
  var payload = _ref2$payload === undefined ? {} : _ref2$payload;

  var productId = payload.product_id || payload.productId;
  var error = payload.err || payload.error || payload;
  var productLensHelper = productLensHelpersById[productId];

  switch (type) {
    case actionTypes.SET_ACTIVE_PRODUCT:
      return R.set(activeProductIdLens, productId, state);

    case actionTypes.FEED_CONNECT:
      return R.set(readyStateLens, 0, state);

    case actionTypes.FEED_SET_SOCKET:
      return R.set(socketLens, payload, state);

    case actionTypes.SOCKET_OPEN:
      return R.set(readyStateLens, 1, state);

    case actionTypes.SOCKET_CLOSE:
      return R.set(readyStateLens, 3, state);

    case actionTypes.SOCKET_ERROR:
      return R.set(errorLens, error, state);

    case actionTypes.SOCKET_MESSAGE:
      return R.compose(payload.type === 'match' ? applyMessageToStats(payload) : R.tap(R.always), payload.type === 'error' ? applyMessageToError(payload) : R.tap(R.always), R.ifElse(productHasSnapshot(payload), applyMessageToOrders(payload), enqueueMessage(payload)))(state);

    case actionTypes.API_PRODUCT_STATS_SUCCESS:
      return R.compose(R.set(productLensHelper(['stats', 'open']), +payload.open), // what is open? -24Hr?
      R.set(productLensHelper(['stats', '24HrHigh']), +payload.high), R.set(productLensHelper(['stats', '24HrLow']), +payload.low), R.set(productLensHelper(['stats', '24HrVolume']), Math.round(+payload.volume)))(state);

    case actionTypes.API_PRODUCT_TICKER_SUCCESS:
      return R.compose(R.set(productLensHelper(['stats', 'lastTrade']), +payload.price), R.set(productLensHelper(['stats', '24HrVolume']), Math.round(+payload.volume)))(state);

    case actionTypes.API_PRODUCT_BOOK_SUCCESS:
      return R.compose(
      // applySnapshotToMarketData(payload),
      // applySnapshotToOrdersData(payload),
      R.set(productLensHelper(['hasSnapshot']), true))(state);

    default:
      return state;
  }
};

/* Feed Data
** ************************************** */
var feedUrl = FEED_URL;
var feedEventHandlersData = {
  onOpen: function onOpen(e, dispatch) {
    actionCreators.socketOpen(dispatch)(this.readyState);
    // Send subscribe handshake
    this.send(JSON.stringify({ type: 'subscribe', product_ids: PRODUCT_IDS }));
    // Turn on heartbeat
    // this.send(JSON.stringify({type: 'heartbeat', on: true}))
  },
  onClose: function onClose(e, dispatch) {
    actionCreators.socketClose(dispatch)(this.readyState);
  },
  onError: function onError(err, dispatch) {
    actionCreators.socketError(dispatch)(err);
  },
  onMessage: function onMessage(e, dispatch) {
    actionCreators.socketMessage(dispatch)(JSON.parse(e.data));
  }
};

/* Redux Middleware & Store
** ************************************** */
var thunk = thunkMiddleware;

var logger = window.reduxLogger ? window.reduxLogger({
  diff: true,
  collapsed: true,
  predicate: function predicate(getState, action) {
    return action.type !== actionTypes.SOCKET_MESSAGE && !R.contains('REQUEST', action.type) && !R.contains('SUCCESS', action.type);
  }
}) : function (_ref3) {
  var dispatch = _ref3.dispatch;
  var getState = _ref3.getState;
  return function (next) {
    return function (action) {
      console.log({ 'Action Type': action.type, 'Updated State': getState() });
      return next(action);
    };
  };
};

// returns a function that takes a socekt instance and a dispatch
var createSocketEventHandler = function createSocketEventHandler(eventHandler) {
  return function (socket, dispatch) {
    return function (event) {
      return typeof eventHandler === 'function' ? eventHandler.bind(socket)(event, dispatch) : null;
    };
  };
};

// Wrap websocket event handlers with redux functionality
var createSocketMiddleware = function createSocketMiddleware(socketUrl, _ref4, setSocketActionCreator) {
  var onOpen = _ref4.onOpen;
  var onClose = _ref4.onClose;
  var onError = _ref4.onError;
  var onMessage = _ref4.onMessage;
  return function (_ref5) {
    var dispatch = _ref5.dispatch;
    var getState = _ref5.getState;
    return function (next) {
      return function (action) {
        if (action.type === actionTypes.FEED_CONNECT) {
          var _getState = getState();

          var _socket = _getState.feed.socket;

          if (_socket !== null) _socket.close();
          var newSocket = new WebSocket(socketUrl);
          newSocket.onopen = createSocketEventHandler(onOpen)(newSocket, dispatch);
          newSocket.onclose = createSocketEventHandler(onClose)(newSocket, dispatch);
          newSocket.onerror = createSocketEventHandler(onError)(newSocket, dispatch);
          newSocket.onmessage = createSocketEventHandler(onMessage)(newSocket, dispatch);
          setSocketActionCreator(dispatch)(newSocket);
        } else {
          return next(action);
        }
      };
    };
  };
};

var socket = createSocketMiddleware(feedUrl, feedEventHandlersData, actionCreators.feedSetSocket);

var store = createStore(rootReducer, initialState, applyMiddleware(thunk, logger, socket));

/* Connector Creators & Providers -- connecting functions for decorating Containers
** ************************************** */
var connectAction = createActionConnector(actionCreators);

var withLifecycle = function withLifecycle(lifecycleMethodsData) {
  return function (Component) {
    return React.createClass(_extends({}, lifecycleMethodsData, {
      render: function render() {
        return React.createElement(Component, this.props);
      }
    }));
  };
};

/* Displays -- stateless or "dumb" components
** ************************************** */
var Heading = function Heading(_ref6) {
  var children = _ref6.children;
  return React.createElement(
    'h1',
    { className: 'heading' },
    children
  );
};

var Title = function Title(_ref7) {
  var children = _ref7.children;
  return React.createElement(
    'p',
    { className: 'title' },
    children
  );
};

var Subtitle = function Subtitle(_ref8) {
  var children = _ref8.children;
  return React.createElement(
    'p',
    { className: 'subtitle' },
    children
  );
};

var ProductSelector = function ProductSelector(_ref9) {
  var activeProductId = _ref9.activeProductId;
  var productIds = _ref9.productIds;
  var setActiveProduct = _ref9.setActiveProduct;
  return React.createElement(
    'ul',
    { className: 'product-selector' },
    productIds.map(function (productId) {
      return React.createElement(
        'li',
        {
          key: productId,
          className: 'product-select-btn ' + (productId === activeProductId ? 'active' : 'inactive'),
          onClick: setActiveProduct.bind(null, productId)
        },
        productId
      );
    })
  );
};

var Percentage = function Percentage(_ref10) {
  var initial = _ref10.initial;
  var current = _ref10.current;

  var percent = percentageChange(initial, current) || 0;
  var color = percent >= 0 ? 'green' : 'red';
  return React.createElement(
    'span',
    { className: 'percent ' + color },
    percentify(percent)
  );
};

var PriceDetail = function PriceDetail(_ref11) {
  var price = _ref11.price;
  var unit = _ref11.unit;
  return React.createElement(
    'div',
    { className: 'price detail' },
    React.createElement(
      Title,
      null,
      commaify(price, true) + ' ' + unit
    ),
    React.createElement(
      Subtitle,
      null,
      'Last trade price'
    )
  );
};

var PercentChangeDetail = function PercentChangeDetail(_ref12) {
  var initial = _ref12.initial;
  var current = _ref12.current;
  return React.createElement(
    'div',
    { className: 'price-change detail' },
    React.createElement(
      Title,
      null,
      React.createElement(Percentage, { initial: initial, current: current })
    ),
    React.createElement(
      Subtitle,
      null,
      '24 hour price'
    )
  );
};

var VolumeDetail = function VolumeDetail(_ref13) {
  var volume = _ref13.volume;
  var unit = _ref13.unit;
  return React.createElement(
    'div',
    { className: '24hr-volume detail' },
    React.createElement(
      Title,
      null,
      commaify(volume) + ' ' + unit
    ),
    React.createElement(
      Subtitle,
      null,
      '24 hour volume'
    )
  );
};

var OrderItem = function OrderItem(_ref14) {
  var price = _ref14.price;
  var size = _ref14.size;
  var numOrders = _ref14.numOrders;
  return React.createElement(
    'li',
    { className: 'order-item' },
    React.createElement(
      'label',
      null,
      '$',
      commaify(price)
    ),
    React.createElement(
      'label',
      null,
      ' Size: ',
      size
    ),
    React.createElement(
      'label',
      null,
      ' Num Orders: ',
      numOrders
    )
  );
};

var OrderSheet = function OrderSheet(_ref15) {
  var side = _ref15.side;
  var orders = _ref15.orders;
  return React.createElement(
    'div',
    { className: 'order-sheet flex-item' },
    React.createElement(
      Title,
      null,
      side
    ),
    React.createElement(
      'ul',
      { className: 'order-list' },
      orders.map(function (order) {
        var price = order[0];
        var size = order[1];
        var orderId = order[2];

        var props = { price: price, size: size, orderId: orderId };
        return React.createElement(OrderItem, _extends({ key: orderId }, props));
      })
    )
  );
};

var Book = function Book(_ref16) {
  var bids = _ref16.bids;
  var asks = _ref16.asks;
  return React.createElement('div', { className: 'order-book flex-container' });
};

var ProductDetails = function ProductDetails(_ref17) {
  var _ref17$product = _ref17.product;
  var id = _ref17$product.id;
  var baseCurrency = _ref17$product.baseCurrency;
  var quoteCurrency = _ref17$product.quoteCurrency;
  var stats = _ref17$product.stats;
  var book = _ref17$product.book;
  return React.createElement(
    'div',
    { className: 'product-details' },
    React.createElement(PriceDetail, { price: stats.lastTrade, unit: quoteCurrency }),
    React.createElement(PercentChangeDetail, { initial: stats.open, current: stats.lastTrade }),
    React.createElement(VolumeDetail, { volume: stats['24HrVolume'], unit: baseCurrency }),
    React.createElement(Book, book)
  );
};

var FeedStatus = function FeedStatus(_ref18) {
  var readyState = _ref18.readyState;
  return React.createElement(
    'div',
    { className: 'feed-state' },
    'Feed Status: ',
    function (_) {
      switch (readyState) {
        case 0:
          return React.createElement(
            'span',
            { className: 'yellow' },
            'Connecting'
          );
        case 1:
          return React.createElement(
            'span',
            { className: 'green' },
            'Open'
          );
        default:
          return React.createElement(
            'span',
            { className: 'red' },
            'Closed'
          );
      }
    }()
  );
};

var ErrorMessage = function ErrorMessage(_ref19) {
  var error = _ref19.error;
  return React.createElement(
    'div',
    { className: 'error-message' },
    'Error Message: ',
    error ? React.createElement(
      'span',
      { className: 'red' },
      error || error.message
    ) : React.createElement(
      'span',
      { className: 'green' },
      'None'
    )
  );
};

var Diagnostics = function Diagnostics(_ref20) {
  var readyState = _ref20.readyState;
  var error = _ref20.error;
  return React.createElement(
    'div',
    { className: 'diagnostics' },
    React.createElement(
      Title,
      null,
      'Diagnostics'
    ),
    React.createElement(FeedStatus, { readyState: readyState }),
    React.createElement(ErrorMessage, { error: error })
  );
};

var StateViewer = function StateViewer(_ref21) {
  var _ref21$state = _ref21.state;
  var state = _ref21$state === undefined ? {} : _ref21$state;
  return React.createElement(
    Highlight,
    { clasName: 'json' },
    JSON.stringify(state, null, 2)
  );
};

/* Containers -- decorated (stateful) or "smart" components
** ************************************** */
var CurrProductSelector = R.compose(connectStateValue('activeProductId'), connectValue(PRODUCT_IDS, 'productIds'), connectAction('setActiveProduct'))(ProductSelector);

var CurrActiveProduct = R.compose(connectStateValue('activeProductId', 'product', function (productId, state) {
  return R.view(productLensHelpersById[productId](), state);
}))(ProductDetails);

var CurrDiagnostics = R.compose(connectStateValue('feed.readyState'), connectStateValue('feed.error'))(Diagnostics);

var idLens = R.lensProp('id');
var baseCurrencyLens = R.lensProp('baseCurrency');
var quoteCurrencyLens = R.lensProp('quoteCurrency');
var statsLens = R.lensProp('stats');

var CurrActiveProductStateViewer = R.compose(connectStateValue('activeProductId', 'state', function (productId, state) {
  return R.pipe(R.set(idLens, R.view(productLensHelpersById[productId](['id']), state)), R.set(baseCurrencyLens, R.view(productLensHelpersById[productId](['baseCurrency']), state)), R.set(quoteCurrencyLens, R.view(productLensHelpersById[productId](['quoteCurrency']), state)), R.set(statsLens, R.view(productLensHelpersById[productId](['stats']), state)))({});
}))(StateViewer);

/* Main Component & App Container
** ************************************** */
var Main = function Main(props) {
  return React.createElement(
    'main',
    null,
    React.createElement(
      Heading,
      null,
      'GDAX'
    ),
    React.createElement(CurrProductSelector, null),
    React.createElement(CurrActiveProduct, null),
    React.createElement(CurrDiagnostics, null)
  );
};

var App = withLifecycle({
  // connect feed and make api requests on componentWillMount
  componentWillMount: function componentWillMount(_) {
    var apiProductRequest = actionCreators.apiProductRequest;
    var feedConnect = actionCreators.feedConnect;

    var dayDuration = moment.duration(24, 'hours'); // moment duration object
    var level = 3; // book response detail: 1 = Only the best bid and ask, 2 = Top 50 bids and asks (aggregated), 3 = Full order book (non aggregated)

    var pollingInterval = 2000;
    var pollingIndex = 0;

    // polling helper function
    var pollProducts = function pollProducts() {
      var withTicker = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      var productId = PRODUCT_IDS[pollingIndex];
      var end = moment().subtract(dayDuration).toISOString();
      var start = moment(end).subtract(dayDuration).toISOString();
      pollingIndex = ++pollingIndex % PRODUCT_IDS.length; // increment index
      return axios.all([apiProductRequest(store.dispatch)(productId, 'stats'),
      // flag to only use with ticker on initial request
      withTicker ? apiProductRequest(store.dispatch)(productId, 'ticker') : undefined]);
    };

    var pollProductsWithTicker = pollProducts.bind(null, true);

    // first fire off initial polling requests
    PRODUCT_IDS.forEach(pollProductsWithTicker);

    // now wait a second to respect api rate limit and connect to the websocket feed
    wait(1000).then(function (_) {
      return feedConnect(store.dispatch)();
    });

    // wait again and request product order books
    wait(2000).then(function (_) {
      return axios.all(PRODUCT_IDS.map(function (productId) {
        return apiProductRequest(store.dispatch)(productId, 'book', { level: level });
      }));
    });

    // finally, start polling interval that requests 24Hr stats for each product
    wait(3000).then(function (_) {
      return setInterval(pollProducts, pollingInterval);
    });
  }
})(Main);

ReactDOM.render(React.createElement(
  Provider,
  { store: store },
  React.createElement(App, null)
), domContainerNode);