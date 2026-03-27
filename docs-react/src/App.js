import {BrowserRouter , Routes , Route} from 'react-router-dom'
import Login from './pages/login';
import SignUp from './pages/temp';

function App() {
  return (
    <BrowserRouter>
    <Routes>
        <Route path = "/" element = {<SignUp/>}/>
        <Route path = "/login" element = {<Login/>}/>
    </Routes>
    </BrowserRouter>
  );
}

export default App;
