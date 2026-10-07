import { useState, useEffect } from 'react';
import { Search, Plus, MapPin, Phone, User, MonitorSmartphone, Hash, Lock } from 'lucide-react';

// ВСТАВТЕ ВАШЕ ПОСИЛАННЯ ТУТ
const API_URL = "https://technosmart-repair-api.yemetsvova.workers.dev";
const STATUSES = ['Нові', 'В роботі', 'Виконані', 'Видані'];
const POINTS = ['Техносмарт', 'Vodafone'];

// НАЛАШТУВАННЯ ПАРОЛІВ (можете змінити на свої)
const USERS = {
  'Техносмарт': 'K8399383m*',
  'Vodafone': 'K8399383m*',
  'Керівник': 'admin'
};

export default function App() {
  // Стан авторизації
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('Техносмарт');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Стан програми
  const [tasks, setTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPoint, setSelectedPoint] = useState("Всі");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    client: '', phone: '', device: '', imei: '', issue: '', price: '', point: POINTS[0]
  });

  useEffect(() => {
    if (isLoggedIn) {
      fetchTasks();
    }
  }, [isLoggedIn]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (USERS[currentUser] === passwordInput) {
      setIsLoggedIn(true);
      // Якщо це конкретна точка, фіксуємо її. Якщо керівник - показуємо всі.
      if (currentUser !== 'Керівник') {
        setSelectedPoint(currentUser);
        setFormData({ ...formData, point: currentUser });
      } else {
        setSelectedPoint('Всі');
      }
    } else {
      setLoginError('Невірний пароль!');
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Помилка завантаження", error);
    }
    setLoading(false);
  };


const handleAddSubmit = async (e) => {
  e.preventDefault();

  const newTask = {
    action: "add",
    id: `TEST-${Date.now()}`,
    ...formData,
    status: "Нові"
  };

  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(newTask)
    });

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error(result.error || "Помилка запису");
    }

    // Отримуємо оновлений список із Google Sheets
    const refreshResponse = await fetch(API_URL);

    if (!refreshResponse.ok) {
      throw new Error("Ремонт збережено, але список не оновився");
    }

    const updatedTasks = await refreshResponse.json();

    if (!Array.isArray(updatedTasks)) {
      throw new Error("Ремонт збережено, але відповідь некоректна");
    }

    setTasks(updatedTasks);
    setIsFormOpen(false);

    setFormData({
      client: "",
      phone: "",
      device: "",
      imei: "",
      issue: "",
      price: "",
      point: formData.point
    });

    alert("Тестовий ремонт збережено в Google Sheets!");
  } catch (error) {
    console.error("Помилка CRM:", error);
    alert(error.message);
  } finally {
    setLoading(false);
  }
};



const updateStatus = async (id, newStatus) => {
  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "updateStatus",
        id,
        status: newStatus
      })
    });

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error(result.error || "Помилка зміни статусу");
    }

    const refreshResponse = await fetch(API_URL);

    if (!refreshResponse.ok) {
      throw new Error(
        "Статус збережено, але список не оновився"
      );
    }

    const updatedTasks = await refreshResponse.json();

    if (!Array.isArray(updatedTasks)) {
      throw new Error("Некоректна відповідь сервера");
    }

    setTasks(updatedTasks);

  } catch (error) {
    console.error("Помилка зміни статусу:", error);
    alert("Не вдалося змінити статус: " + error.message);

    // Відновлюємо дані із сервера
    await fetchTasks();
  } finally {
    setLoading(false);
  }
};


  const filteredTasks = tasks.filter(task => {
    // ПОШУК ТАКОЖ ПРАЦЮЄ ПО IMEI
    const matchSearch = task.client?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        task.phone?.includes(searchQuery) ||
                        task.device?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        task.imei?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        task.id?.toString().includes(searchQuery);

    const matchPoint = selectedPoint === "Всі" || task.point === selectedPoint;
    return matchSearch && matchPoint;
  });

  // ЕКРАН ВХОДУ (ЛОГІН)
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-3 rounded-full"><Lock className="text-blue-600 w-8 h-8" /></div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Вхід у CRM</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Користувач</label>
              <select
                className="w-full p-3 border rounded-lg bg-gray-50 outline-none"
                value={currentUser}
                onChange={(e) => setCurrentUser(e.target.value)}
              >
                {Object.keys(USERS).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Пароль</label>
              <input
                type="password"
                placeholder="Введіть пароль"
                className="w-full p-3 border rounded-lg bg-gray-50 outline-none"
                value={passwordInput}
                onChange={(e) => {setPasswordInput(e.target.value); setLoginError('');}}
              />
            </div>
            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition">
              Увійти
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ГОЛОВНИЙ ЕКРАН CRM
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">CRM Ремонти</h1>
            <span className="ml-2 text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded-lg">{currentUser}</span>
          </div>

          {currentUser === 'Керівник' && (
            <select
              className="p-2 border rounded-lg bg-gray-50 outline-none"
              value={selectedPoint}
              onChange={(e) => setSelectedPoint(e.target.value)}
            >
              <option value="Всі">Всі точки</option>
              {POINTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <div className="flex w-full md:w-auto gap-2">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Пошук (Ім'я, Телефон, Пристрій, IMEI)..."
                className="w-full pl-10 p-2 border rounded-lg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setIsFormOpen(true)}
              className="bg-blue-600 text-white p-2 rounded-lg flex items-center gap-1 hover:bg-blue-700 transition shrink-0"
            >
              <Plus w-5 h-5 /> <span className="hidden md:inline">Додати</span>
            </button>
            <button
              onClick={() => {setIsLoggedIn(false); setPasswordInput('');}}
              className="bg-gray-200 text-gray-700 p-2 rounded-lg hover:bg-gray-300 transition shrink-0"
            >
              Вихід
            </button>
          </div>
        </header>

        {isFormOpen && (
          <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold mb-4">Новий ремонт</h2>
            <form onSubmit={handleAddSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input required type="text" placeholder="Ім'я клієнта" className="p-2 border rounded" value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} />
              <input required type="text" placeholder="Телефон" className="p-2 border rounded" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              <input required type="text" placeholder="Пристрій (модель)" className="p-2 border rounded" value={formData.device} onChange={e => setFormData({...formData, device: e.target.value})} />
              <input type="text" placeholder="IMEI / SN" className="p-2 border rounded" value={formData.imei} onChange={e => setFormData({...formData, imei: e.target.value})} />

              <input required type="text" placeholder="Поломка" className="p-2 border rounded md:col-span-2" value={formData.issue} onChange={e => setFormData({...formData, issue: e.target.value})} />
              <input type="number" placeholder="Орієнтовна ціна" className="p-2 border rounded" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />

              <select
                className="p-2 border rounded bg-gray-50"
                value={formData.point}
                onChange={e => setFormData({...formData, point: e.target.value})}
                disabled={currentUser !== 'Керівник'} // Звичайні точки не можуть змінити свою точку при додаванні
              >
                {POINTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Скасувати</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Зберегти</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-500">Завантаження бази даних...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            {STATUSES.map(status => (
              <div key={status} className="bg-gray-50 p-4 rounded-xl min-w-[300px] flex-1 border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-3 px-2 flex justify-between">
                  {status}
                  <span className="bg-gray-200 text-sm px-2 rounded-full">
                    {filteredTasks.filter(t => t.status === status).length}
                  </span>
                </h3>
                <div className="flex flex-col gap-3">
                  {filteredTasks.filter(t => t.status === status).map(task => (
                    <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 relative">
                      <div className="text-xs text-gray-400 mb-1 flex justify-between">
                        <span>#{task.id.toString().slice(-4)}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{task.point}</span>
                      </div>
                      <h4 className="font-bold text-gray-800 mb-1">{task.device}</h4>
                      {task.imei && (
                        <p className="text-xs text-gray-500 font-mono mb-2 flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {task.imei}
                        </p>
                      )}
                      <p className="text-sm text-red-500 mb-2">{task.issue}</p>
                      <div className="text-sm text-gray-600 mb-3 space-y-1">
                        <p className="flex items-center gap-2"><User className="w-4 h-4"/> {task.client}</p>
                        <p className="flex items-center gap-2"><Phone className="w-4 h-4"/> {task.phone}</p>
                      </div>
                      <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                        <span className="font-bold text-green-600">{task.price} ₴</span>
                        <select
                          className="text-sm border rounded p-1 bg-gray-50 outline-none"
                          value={task.status}
                          onChange={(e) => updateStatus(task.id, e.target.value)}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
