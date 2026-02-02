# ACE Fixings App - Code Structure

## Directory Organization

This refactored codebase is organized into clean, modular directories for easy maintenance and updates.

### 📁 `src/config/`
Global configuration and constants

- **`shopify.js`** - Shopify API credentials, domains, tokens, OAuth config
- **`constants.js`** - App constants (VAT rate, brand colors, bulk pricing)
- **`storage.js`** - Local storage key constants

### 📁 `src/utils/`
Reusable utility functions with no dependencies on React or app state

- **`crypto.js`** - Cryptography (SHA256, JWT decoding, PKCE, random generation)
- **`formatting.js`** - Value formatting (currency, dates, numbers)
- **`url.js`** - URL parsing and query string utilities
- **`http.js`** - HTTP requests (native vs web, Shopify API calls)

### 📁 `src/components/`
Reusable UI components

- **`Button.jsx`** - Button with variants, sizes, loading states
- **`Badge.jsx`** - Status badges
- **`Toast.jsx`** - Toast notifications
- **`SearchBar.jsx`** - Search input component

### 📁 `src/hooks/`
Custom React hooks for state management

- **`useAuth.js`** - Authentication state, login, logout, OAuth callback
- **`useCart.js`** - Shopping cart state and operations
- **`useOrders.js`** - Customer orders fetching and caching
- **`useProducts.js`** - Products, collections, search, filters

### 📁 `src/services/`
Business logic and API integrations

- **`oauth.js`** - OAuth flow (PKCE, token exchange, deep links)
- **`shopifyGraphql.js`** - Shopify product queries
- **`customerApi.js`** - Shopify Customer Account API (orders, profile)

### 📁 `src/views/`
Full-page view components

- **`HomeView.jsx`** - Homepage with featured products
- **`ProductView.jsx`** - Product detail page
- **`CollectionView.jsx`** - Collection products listing
- **`CartView.jsx`** - Shopping cart
- **`CheckoutView.jsx`** - Checkout (redirects to Shopify)
- **`OrdersView.jsx`** - Order history
- **`AccountView.jsx`** - Account login/profile
- **`FavoritesView.jsx`** - Saved favorites

### 📄 `src/App.jsx`
Thin main component that orchestrates everything

---

## Finding Things

| Need to find... | Look in... |
|---|---|
| Login button behavior | `src/components/Button.jsx` + `src/hooks/useAuth.js` |
| Product search | `src/hooks/useProducts.js` |
| Shopping cart logic | `src/hooks/useCart.js` |
| OAuth configuration | `src/config/shopify.js` |
| API calls to Shopify | `src/services/shopifyGraphql.js` |
| Token exchange | `src/services/oauth.js` |
| Format currency | `src/utils/formatting.js` |
| Storage keys | `src/config/storage.js` |

---

## Adding New Features

### To add a new API call:
1. Add the GraphQL query to `src/services/shopifyGraphql.js`
2. Create a hook in `src/hooks/` if it needs state
3. Call the hook from your view component

### To add a new UI component:
1. Create file in `src/components/`
2. Export from component
3. Import in your view

### To add a new page:
1. Create view in `src/views/YourViewName.jsx`
2. Add to view routing in `src/App.jsx`
3. Add navigation to `HomeView.jsx` or menu

---

## Dependencies

- **React 18.3.1** - UI framework
- **Capacitor 8.0.1** - Native mobile features
- **Vite 7.3.1** - Build tool
- **Tailwind CSS** - Styling (via utility classes)
- **OneSignal** - Push notifications

---

## Build & Deploy

```bash
# Build for production
npm run build

# Sync to Android
npx cap sync android

# Build Android APK
cd android && ./gradlew.bat assembleDebug

# Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
