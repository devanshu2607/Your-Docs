import {BrowserRouter , Routes , Route} from 'react-router-dom'
import Login from './pages/login';
import SignUp from './pages/temp';
import CreateDocs from './pages/createdocs'
import Dashboard from './pages/dashboard'
import Update from './pages/updatedocs'

function App() {
  return (
    <BrowserRouter>
    <Routes>
        <Route path = "/" element = {<SignUp/>}/>
        <Route path = "/login" element = {<Login/>}/>
        <Route path = "/create_docs" element ={<CreateDocs/>}/>
        <Route path = "/dashboard" element = {<Dashboard/>}/>
        <Route path = "/update/:id" element = {<Update/>}/>
    </Routes>
    </BrowserRouter>
  );
}

export default App;
