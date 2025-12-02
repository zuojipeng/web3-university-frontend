import { useState, useEffect } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import { useAccount, useReadContract } from 'wagmi';
import { COURSE_PURCHASE_ADDRESS, COURSE_PURCHASE_ABI } from '../config';

/**
 * 课程内容查看器组件
 * 
 * 功能：
 * 1. 从 IPFS 下载课程内容
 * 2. 自动解压（如果是压缩文件）
 * 3. 显示/下载原始文件
 * 4. 支持多种文件格式预览
 * 5. 权限检查：只有已购买或创建者才能查看
 */

export default function CourseContentViewer({ contentHash, courseName, courseId, courseAuthor, isOpen, onClose }) {
  const { address } = useAccount();
  
  // 检查是否是创建者
  const isCreator = address && courseAuthor && 
    courseAuthor.toLowerCase() === address.toLowerCase();

  // 检查是否已购买（如果不是创建者，hasPurchased 函数在 CoursePurchase 合约中）
  const { data: hasPurchased } = useReadContract({
    address: COURSE_PURCHASE_ADDRESS,
    abi: COURSE_PURCHASE_ABI,
    functionName: 'hasPurchased',
    args: address && courseId && !isCreator ? [address, BigInt(courseId)] : undefined,
    query: {
      enabled: isOpen && !!address && !!courseId && !isCreator,
    },
  });

  // 检查权限
  const hasPermission = isCreator || hasPurchased === true;
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileType, setFileType] = useState(null);

  const IPFS_GATEWAY = process.env.VITE_IPFS_GATEWAY || process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud';
  const ipfsUrl = contentHash ? `${IPFS_GATEWAY}/ipfs/${contentHash}` : null;

  // 权限检查：如果没有权限，显示错误并阻止查看
  useEffect(() => {
    if (!isOpen) return;
    
    // 如果已连接钱包但无权限，显示错误
    if (address && !hasPermission && courseId) {
      setError('您没有权限查看此课程内容。请先购买课程。');
      setLoading(false);
    }
  }, [isOpen, address, hasPermission, courseId]);

  // 检测文件类型（通过文件扩展名或 HEAD 请求）
  useEffect(() => {
    if (!isOpen || !contentHash || !ipfsUrl) return;
    
    // 如果没有权限，不加载内容
    if (address && !hasPermission && courseId) {
      return;
    }

    const detectFileType = async () => {
      setLoading(true);
      try {
        // 先尝试 HEAD 请求获取 Content-Type
        const headResponse = await fetch(ipfsUrl, { method: 'HEAD' });
        const contentType = headResponse.headers.get('content-type') || 'application/octet-stream';
        
        setFileType(contentType);
        setPreviewUrl(ipfsUrl); // 直接使用 IPFS URL 作为预览源
        
        // 如果文件类型支持直接预览，设置预览 URL
        if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType === 'application/pdf') {
          setFileInfo({
            name: courseName || 'course-content',
            type: contentType,
            canPreview: true
          });
        } else {
          setFileInfo({
            name: courseName || 'course-content',
            type: contentType,
            canPreview: false
          });
        }
      } catch (err) {
        console.error('检测文件类型失败:', err);
        // 如果 HEAD 请求失败，尝试通过文件扩展名推断
        // 这里可以根据 contentHash 或 courseName 推断
        setFileType('application/octet-stream');
        setFileInfo({
          name: courseName || 'course-content',
          type: 'application/octet-stream',
          canPreview: false
        });
      } finally {
        setLoading(false);
      }
    };

    detectFileType();

    // 清理函数
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, contentHash, ipfsUrl, courseName]);

  // 关闭时清理状态
  useEffect(() => {
    if (!isOpen) {
      setFileInfo(null);
      setFileType(null);
      setPreviewUrl(null);
      setError('');
      setLoading(false);
      setDownloading(false);
    }
  }, [isOpen]);

  // 下载并解压文件
  const handleDownload = async () => {
    if (!contentHash) {
      setError('无效的 IPFS Hash');
      return;
    }

    setDownloading(true);
    setError('');

    try {
      // console.log('开始从 IPFS 下载文件...', ipfsUrl);

      // 从 IPFS 下载文件
      const response = await axios.get(ipfsUrl, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          // console.log(`下载进度: ${percentCompleted}%`);
        }
      });

      // console.log('文件下载完成，大小:', response.data.size);

      let fileBlob = response.data;
      let fileName = courseName || 'course-content';
      let fileType = 'application/octet-stream';

      // 检查是否是 ZIP 文件
      if (response.data.type === 'application/zip' || contentHash.endsWith('.zip')) {
        // console.log('检测到 ZIP 文件，开始解压...');
        
        try {
          const zip = new JSZip();
          const zipData = await zip.loadAsync(response.data);
          
          // 获取第一个文件（通常课程内容只有一个文件）
          const fileNames = Object.keys(zipData.files);
          const firstFile = fileNames.find(name => !zipData.files[name].dir);
          
          if (firstFile) {
            const file = zipData.files[firstFile];
            fileBlob = await file.async('blob');
            fileName = firstFile;
            fileType = fileBlob.type || 'application/octet-stream';
            // console.log('解压成功，文件名:', fileName);
          } else {
            throw new Error('ZIP 文件中没有找到文件');
          }
        } catch (zipError) {
          console.error('解压失败:', zipError);
          // 如果解压失败，尝试作为普通文件下载
          // console.log('解压失败，尝试作为普通文件下载');
        }
      }

      // 创建下载链接
      const url = window.URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // 更新文件信息（但不覆盖预览 URL，因为预览直接使用 IPFS URL）
      setFileInfo(prev => ({
        ...prev,
        name: fileName,
        type: fileType,
        size: fileBlob.size,
        blob: fileBlob
      }));

      // console.log('✅ 文件下载成功');

    } catch (err) {
      console.error('下载失败:', err);
      setError(err.response?.data?.message || err.message || '下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen || !contentHash) return null;

  // 权限检查：如果没有权限，显示错误信息
  if (address && courseId && !hasPermission) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-2xl font-bold text-red-400 mb-6">权限不足</h2>
          
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-400 text-sm mb-2">
              ⚠️ 您没有权限查看此课程内容
            </p>
            <p className="text-gray-400 text-sm">
              只有已购买此课程或课程创建者才能查看课程内容。
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-purple-400 mb-6">课程内容: {courseName}</h2>

        {/* IPFS 信息 */}
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">IPFS Hash:</span>
              <span className="text-white font-mono text-xs break-all">
                {contentHash}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">IPFS URL:</span>
              <div className="flex items-center space-x-2">
                <a
                  href={ipfsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-xs break-all"
                  title="在新标签页中打开预览"
                >
                  {ipfsUrl}
                </a>
                {fileType?.startsWith('video/') && (
                  <span className="text-green-400 text-xs">🎬 可直接播放</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="mb-4 bg-blue-900/20 border border-blue-500 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-blue-400 text-sm">正在检测文件类型...</p>
            </div>
          </div>
        )}

        {/* 下载按钮 */}
        <div className="mb-4">
          <button
            onClick={handleDownload}
            disabled={downloading || loading}
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                下载中...
              </span>
            ) : (
              '下载课程内容'
            )}
          </button>
        </div>

        {/* 文件信息 */}
        {fileInfo && (
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">文件类型:</span>
                <span className="text-white">{fileType || fileInfo.type || '未知'}</span>
              </div>
              {fileInfo.size && (
                <div className="flex justify-between">
                  <span className="text-gray-400">大小:</span>
                  <span className="text-white">{formatFileSize(fileInfo.size)}</span>
                </div>
              )}
              {fileInfo.canPreview && (
                <div className="flex justify-between">
                  <span className="text-gray-400">预览:</span>
                  <span className="text-green-400">✅ 支持在线预览</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 预览区域 - 直接使用 IPFS URL */}
        {previewUrl && fileInfo && fileInfo.canPreview && (
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <h3 className="text-white font-semibold mb-3">文件预览</h3>
            {fileType?.startsWith('image/') && (
              <div className="flex justify-center">
                <img 
                  src={ipfsUrl} 
                  alt={fileInfo.name} 
                  className="max-w-full max-h-[60vh] h-auto rounded object-contain"
                  onError={(e) => {
                    console.error('图片加载失败');
                    setError('图片加载失败，请尝试下载文件');
                  }}
                />
              </div>
            )}
            {fileType?.startsWith('video/') && (
              <div className="w-full">
                <video 
                  src={ipfsUrl} 
                  controls 
                  className="w-full max-h-[60vh] rounded"
                  preload="metadata"
                  onError={(e) => {
                    console.error('视频加载失败:', e);
                    setError('视频加载失败，请尝试下载文件或检查网络连接');
                  }}
                >
                  您的浏览器不支持视频播放
                </video>
                <p className="text-gray-400 text-xs mt-2 text-center">
                  💡 提示：如果视频无法播放，请点击下方"下载课程内容"按钮下载后观看
                </p>
              </div>
            )}
            {fileType === 'application/pdf' && (
              <div className="w-full" style={{ height: '60vh' }}>
                <iframe
                  src={ipfsUrl}
                  className="w-full h-full rounded border-none"
                  title={fileInfo.name}
                  onError={(e) => {
                    console.error('PDF 加载失败');
                    setError('PDF 加载失败，请尝试下载文件');
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* 如果文件不支持预览，显示提示 */}
        {fileInfo && !fileInfo.canPreview && (
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 mb-4">
            <p className="text-yellow-400 text-sm">
              ⚠️ 此文件类型 ({fileType}) 不支持在线预览，请下载后使用相应软件打开
            </p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* 提示信息 */}
        <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <svg className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-blue-400 text-sm">
              <p className="font-semibold mb-1">使用说明：</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>点击"下载课程内容"按钮下载文件</li>
                <li>如果文件是压缩格式，会自动解压</li>
                <li>图片、视频、PDF 文件可以直接预览</li>
                <li>其他格式文件需要下载后使用相应软件打开</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

