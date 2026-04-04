import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/login'
import SignUp from './pages/temp'
import CreateDocs from './pages/createdocs'
import Dashboard from './pages/dashboard'
import UpdateDocs from './pages/updatedocs'
import JoinDocs from './pages/JoinDocs'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create_docs" element={<CreateDocs />} />
        <Route path="/join/:docId" element={<JoinDocs />} />
        <Route path="/update/:id" element={<UpdateDocs />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App;